import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import crypto from 'crypto';
import { db, workflows } from '@pulse/db';
import { and, eq } from 'drizzle-orm';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'pulse_webhook_secret_key';

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

interface WorkflowEventPayload {
  workspaceId: string;
  triggerType: string;
  entity: Record<string, unknown>;
}

interface FlowNode {
  id: string;
  type: string;
  data: {
    label?: string;
    targetStatus?: string;
    webhookUrl?: string;
  };
}

interface FlowEdge {
  source: string;
  target: string;
}

const worker = new Worker<WorkflowEventPayload>(
  'workflow-events',
  async (job: Job<WorkflowEventPayload>) => {
    const { workspaceId, triggerType, entity } = job.data;
    console.log(`[Worker] Received ${triggerType} for task "${entity.title}"`);

    const activeWorkflows = await db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.workspaceId, workspaceId),
          eq(workflows.triggerType, triggerType),
          eq(workflows.isActive, true)
        )
      );

    for (const wf of activeWorkflows) {
      const graph = wf.graphDefinition as { nodes: FlowNode[]; edges: FlowEdge[] };
      const triggerNode = graph.nodes.find((n) => n.type === 'trigger');
      if (!triggerNode) continue;

      let currentNode: FlowNode | undefined = triggerNode;
      while (currentNode) {
        if (currentNode.type === 'condition') {
          const expectedStatus = currentNode.data.targetStatus || 'DONE';
          if (entity.status !== expectedStatus) {
            console.log(`[Worker] Condition failed: ${entity.status} !== ${expectedStatus}`);
            break;
          }
        }

        if (currentNode.type === 'action' && currentNode.data.webhookUrl) {
          const payload = JSON.stringify({
            event: triggerType,
            workflowId: wf.id,
            timestamp: new Date().toISOString(),
            data: entity,
          });

          const signature = crypto
            .createHmac('sha256', WEBHOOK_SECRET)
            .update(payload)
            .digest('hex');

          console.log(`[Worker] Dispatching signed webhook to ${currentNode.data.webhookUrl}`);

          const response = await fetch(currentNode.data.webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Pulse-Signature': `sha256=${signature}`,
            },
            body: payload,
          });

          if (!response.ok) {
            throw new Error(`Webhook responded with HTTP ${response.status}`);
          }
          console.log(`[Worker] Webhook delivered successfully (HTTP ${response.status})`);
        }

        const nextEdge = graph.edges.find((e) => e.source === currentNode!.id);
        currentNode = nextEdge ? graph.nodes.find((n) => n.id === nextEdge.target) : undefined;
      }
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed (will retry):`, err.message);
});

console.log('Pulse Workflow Worker listening on queue "workflow-events"...');