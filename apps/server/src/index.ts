import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { handleWsConnection } from './yjsHandler';
import { ensureDemoDocExists } from './seed';
import { registerTaskRoutes } from './routes/tasks';
import { registerWorkflowRoutes } from './routes/workflows';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PORT = Number(process.env.PORT) || 4000;

const fastify = Fastify({ logger: true });
const taskSub = new Redis(REDIS_URL);
const taskRooms = new Map<string, Set<WebSocket>>();

taskSub.on('message', (channel, message) => {
  if (!channel.startsWith('workspace:tasks:')) return;
  const workspaceId = channel.replace('workspace:tasks:', '');
  const sockets = taskRooms.get(workspaceId);
  sockets?.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  });
});

async function start() {
  await ensureDemoDocExists();

  await fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await fastify.register(websocket);

  await registerTaskRoutes(fastify);
  await registerWorkflowRoutes(fastify);

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.register(async function (app) {
    // Document CRDT WebSocket
    app.get('/ws/:docId', { websocket: true }, async (socket, req) => {
      const { docId } = req.params as { docId: string };
      await handleWsConnection(socket, docId);
    });

    // Real-time Kanban Board WebSocket
    app.get('/ws/tasks/:workspaceId', { websocket: true }, async (socket, req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      if (!taskRooms.has(workspaceId)) {
        taskRooms.set(workspaceId, new Set());
        await taskSub.subscribe(`workspace:tasks:${workspaceId}`);
      }
      const room = taskRooms.get(workspaceId)!;
      room.add(socket);

      socket.on('close', () => {
        room.delete(socket);
      });
    });
  });

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Pulse Sync Server running on http://localhost:${PORT}`);
}

start();