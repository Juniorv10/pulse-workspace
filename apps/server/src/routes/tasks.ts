import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, tasks } from '@pulse/db';
import { eq, asc } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import Redis from 'ioredis';
import { workflowQueue } from '../queue';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const pub = new Redis(REDIS_URL);
export const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000100';

function requireWriteRole(req: FastifyRequest, reply: FastifyReply): boolean {
  const role = (req.headers['x-pulse-role'] as string) || 'OWNER';
  if (role === 'VIEWER') {
    reply.code(403).send({
      error: 'Forbidden: VIEWER role cannot modify workspace resources.',
    });
    return false;
  }
  return true;
}

export async function registerTaskRoutes(fastify: FastifyInstance) {
  // 1. Fetch all tasks ordered by fractional position
  fastify.get('/api/workspaces/:workspaceId/tasks', async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(asc(tasks.position));
  });

  // 2. Create a new task at the bottom of a column (OWNER / EDITOR only)
  fastify.post('/api/workspaces/:workspaceId/tasks', async (req, reply) => {
    if (!requireWriteRole(req, reply)) return;

    const { workspaceId } = req.params as { workspaceId: string };
    const { title, status = 'TODO' } = req.body as {
      title: string;
      status?: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE';
    };

    const existing = await db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(asc(tasks.position));

    const columnTasks = existing.filter((t) => t.status === status);
    const lastPos = columnTasks.length > 0 ? columnTasks[columnTasks.length - 1].position : null;
    const newPosition = generateKeyBetween(lastPos, null);

    const [created] = await db
      .insert(tasks)
      .values({
        workspaceId,
        title,
        status,
        position: newPosition,
      })
      .returning();

    await pub.publish(
      `workspace:tasks:${workspaceId}`,
      JSON.stringify({ type: 'TASK_CREATED', task: created })
    );

    return created;
  });

  // 3. Move / Reorder a task (OWNER / EDITOR only, O(1) single-row update)
  fastify.patch('/api/tasks/:taskId/move', async (req, reply) => {
    if (!requireWriteRole(req, reply)) return;

    const { taskId } = req.params as { taskId: string };
    const { status, prevPosition, nextPosition } = req.body as {
      status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE';
      prevPosition: string | null;
      nextPosition: string | null;
    };

    const newPosition = generateKeyBetween(prevPosition, nextPosition);

    const [updated] = await db
      .update(tasks)
      .set({ status, position: newPosition })
      .where(eq(tasks.id, taskId))
      .returning();

    if (updated) {
      await pub.publish(
        `workspace:tasks:${updated.workspaceId}`,
        JSON.stringify({ type: 'TASK_MOVED', task: updated })
      );

      await workflowQueue.add('task-moved', {
        workspaceId: updated.workspaceId,
        triggerType: 'TASK_MOVED',
        entity: updated,
      });
    }

    return updated;
  });
}