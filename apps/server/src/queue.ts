import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const workflowQueue = new Queue('workflow-events', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});