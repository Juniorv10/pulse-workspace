'use client';

import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { yCursorPlugin } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

interface UserAwareness {
  name: string;
  color: string;
}

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley'];

function getRandomUser(): UserAwareness {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return { name: `${name} #${Math.floor(Math.random() * 99)}`, color };
}

function EditorCanvas({
  ydoc,
  provider,
  user,
}: {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  user: UserAwareness;
}) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    const onStatus = (event: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setStatus(event.status);
    };
    provider.on('status', onStatus);
    return () => {
      provider.off('status', onStatus);
    };
  }, [provider]);

  const CursorExtension = Extension.create({
    name: 'customYjsCursor',
    addProseMirrorPlugins() {
      return [yCursorPlugin(provider.awareness)];
    },
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CursorExtension,
    ],
    editorProps: {
      attributes: {
        class:
          'prose prose-invert max-w-none min-h-[320px] p-6 focus:outline-none text-neutral-100',
      },
    },
  });

  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: user.color }}
          />
          <span className="text-xs font-medium text-neutral-300">
            Editing as {user.name}
          </span>
        </div>

        <span
          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
            status === 'connected'
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              : 'bg-amber-950 text-amber-400 border border-amber-800'
          }`}
        >
          {status === 'connected' ? 'Synced to Postgres' : 'Connecting...'}
        </span>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

export function CollaborativeEditor({ docId }: { docId: string }) {
  const [session, setSession] = useState<{
    ydoc: Y.Doc;
    provider: WebsocketProvider;
    user: UserAwareness;
  } | null>(null);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const user = getRandomUser();
    const provider = new WebsocketProvider(`${WS_URL}/ws`, docId, ydoc);

    provider.awareness.setLocalStateField('user', user);
    setSession({ ydoc, provider, user });

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [docId]);

  if (!session) return null;

  return (
    <EditorCanvas
      ydoc={session.ydoc}
      provider={session.provider}
      user={session.user}
    />
  );
}