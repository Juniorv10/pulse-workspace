import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { db, documents } from '@pulse/db';
import { eq } from 'drizzle-orm';

const pub = new Redis('redis://localhost:6379');
const sub = new Redis('redis://localhost:6379');

interface DocRoom {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
  saveTimer?: NodeJS.Timeout;
}

const docs = new Map<string, DocRoom>();
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

async function persistDocToPostgres(docId: string, doc: Y.Doc) {
  try {
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));
    await db
      .update(documents)
      .set({ yjsState: state, updatedAt: new Date() })
      .where(eq(documents.id, docId));
    console.log(`[DB] Saved CRDT snapshot for doc ${docId} (${state.byteLength} bytes)`);
  } catch (err) {
    console.error(`[DB] Failed to persist doc ${docId}:`, err);
  }
}

export async function getOrCreateDoc(docId: string): Promise<DocRoom> {
  let entry = docs.get(docId);
  if (!entry) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    entry = { doc, awareness, conns: new Map() };
    docs.set(docId, entry);

    // 1. Hydrate initial state from PostgreSQL if available
    const dbDoc = await db.query.documents.findFirst({
      where: eq(documents.id, docId),
    });
    if (dbDoc?.yjsState) {
      Y.applyUpdate(doc, new Uint8Array(dbDoc.yjsState), 'db-init');
    }

    // 2. Subscribe to Redis Pub/Sub for horizontal scaling
    sub.subscribe(`yjs:doc:${docId}`);

    // 3. Broadcast document updates & schedule debounced DB persistence
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      entry!.conns.forEach((_, conn) => {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) {
          conn.send(message);
        }
      });

      if (origin !== 'redis' && origin !== 'db-init') {
        pub.publishBuffer(`yjs:doc:${docId}`, Buffer.from(update));

        // Debounce Postgres snapshot write (2 seconds after last edit)
        if (entry!.saveTimer) clearTimeout(entry!.saveTimer);
        entry!.saveTimer = setTimeout(() => {
          persistDocToPostgres(docId, doc);
        }, 2000);
      }
    });

    // 4. Broadcast cursor / presence updates
    awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        const changedClients = added.concat(updated, removed);
        if (origin instanceof WebSocket) {
          const controlledIds = entry!.conns.get(origin);
          if (controlledIds) {
            added.forEach((id) => controlledIds.add(id));
            removed.forEach((id) => controlledIds.delete(id));
          }
        }

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const buff = encoding.toUint8Array(encoder);

        entry!.conns.forEach((_, conn) => {
          if (conn !== origin && conn.readyState === WebSocket.OPEN) {
            conn.send(buff);
          }
        });
      }
    );
  }
  return entry;
}

sub.on('messageBuffer', (channelBuffer, messageBuffer) => {
  const channel = channelBuffer.toString();
  if (!channel.startsWith('yjs:doc:')) return;
  const docId = channel.replace('yjs:doc:', '');
  const entry = docs.get(docId);
  if (entry) {
    Y.applyUpdate(entry.doc, new Uint8Array(messageBuffer), 'redis');
  }
});

export async function handleWsConnection(ws: WebSocket, docId: string) {
  const entry = await getOrCreateDoc(docId);
  entry.conns.set(ws, new Set());

  // Send Sync Step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(encoder, entry.doc);
  ws.send(encoding.toUint8Array(encoder));

  // Send existing active cursors to newly joined user
  const awarenessStates = entry.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(entry.awareness, Array.from(awarenessStates.keys()))
    );
    ws.send(encoding.toUint8Array(awarenessEncoder));
  }

  ws.on('message', (data: Buffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const messageType = decoding.readVarUint(decoder);

    if (messageType === MSG_SYNC) {
      const replyEncoder = encoding.createEncoder();
      encoding.writeVarUint(replyEncoder, MSG_SYNC);
      syncProtocol.readSyncMessage(decoder, replyEncoder, entry.doc, ws);
      if (encoding.length(replyEncoder) > 1) {
        ws.send(encoding.toUint8Array(replyEncoder));
      }
    } else if (messageType === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(
        entry.awareness,
        decoding.readVarUint8Array(decoder),
        ws
      );
    }
  });

  ws.on('close', async () => {
    const controlledIds = entry.conns.get(ws);
    entry.conns.delete(ws);

    if (controlledIds) {
      awarenessProtocol.removeAwarenessStates(entry.awareness, Array.from(controlledIds), null);
    }

    // Flush immediately to Postgres when the last user leaves
    if (entry.conns.size === 0) {
      if (entry.saveTimer) clearTimeout(entry.saveTimer);
      await persistDocToPostgres(docId, entry.doc);
    }
  });
}