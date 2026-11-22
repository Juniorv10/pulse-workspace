import { FastifyInstance } from 'fastify';
import { db, workflows } from '@pulse/db';
import { eq } from 'drizzle-orm';

export async function registerWorkflowRoutes(fastify: FastifyInstance) {
  fastify.get('/api/workspaces/:workspaceId/workflows', async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    return db.select().from(workflows).where(eq(workflows.workspaceId, workspaceId));
  });

  fastify.post('/api/workspaces/:workspaceId/workflows', async (req, reply) => {
    const role = (req.headers['x-pulse-role'] as string) || 'OWNER';
    if (role !== 'OWNER') {
      return reply.code(403).send({
        error: 'Forbidden: Only workspace OWNER can modify automation workflows.',
      });
    }

    const { workspaceId } = req.params as { workspaceId: string };
    const { name, triggerType, graphDefinition } = req.body as {
      name: string;
      triggerType: string;
      graphDefinition: unknown;
    };

    await db.delete(workflows).where(eq(workflows.workspaceId, workspaceId));

    const [saved] = await db
      .insert(workflows)
      .values({
        workspaceId,
        name,
        triggerType,
        graphDefinition,
        isActive: true,
      })
      .returning();

    return saved;
  });
}