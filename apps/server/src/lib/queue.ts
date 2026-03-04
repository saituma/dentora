
import { Queue, Worker, type Job, type WorkerOptions, type QueueOptions } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from './logger.js';

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      maxRetriesPerRequest: null as null,
    };
  } catch {
    return { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null as null };
  }
}

const connection = parseRedisUrl(env.REDIS_URL);

export const QUEUE_NAMES = {
  COST_ATTRIBUTION: 'cost-attribution',
  ANALYTICS_EVENTS: 'analytics-events',
  INTEGRATION_CALLBACKS: 'integration-callbacks',
  NOTIFICATION_DELIVERY: 'notification-delivery',
  CONFIG_VALIDATION: 'config-validation',
  RECORDING_PROCESSING: 'recording-processing',
  DAILY_AGGREGATION: 'daily-aggregation',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const defaultQueueOptions: Partial<QueueOptions> = {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
};

const queues = new Map<string, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      ...defaultQueueOptions,
      connection,
    });
    queues.set(name, queue);
    logger.info({ queue: name }, 'Queue initialized');
  }
  return queue;
}

export function createWorker<T extends { tenantId: string }>(
  queueName: QueueName,
  processor: (job: Job<T>) => Promise<void>,
  options: Partial<WorkerOptions> = {},
): Worker<T> {
  const worker = new Worker<T>(
    queueName,
    async (job) => {
      const { tenantId } = job.data;
      if (!tenantId) {
        logger.error({ jobId: job.id, queue: queueName }, 'Job missing tenantId — skipping');
        return;
      }

      const jobLogger = logger.child({
        queue: queueName,
        jobId: job.id,
        tenantId,
        attempt: job.attemptsMade + 1,
      });

      jobLogger.info('Processing job');
      try {
        await processor(job);
        jobLogger.info('Job completed');
      } catch (err) {
        jobLogger.error({ err }, 'Job failed');
        throw err;
      }
    },
    {
      connection,
      concurrency: 5,
      ...options,
    },
  );

  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      logger.error(
        { jobId: job.id, queue: queueName, err },
        'Job moved to dead-letter (max retries exceeded)',
      );
    }
  });

  worker.on('error', (err) => {
    logger.error({ err, queue: queueName }, 'Worker error');
  });

  logger.info({ queue: queueName }, 'Worker started');
  return worker;
}

export async function enqueueJob<T extends { tenantId: string }>(
  queueName: QueueName,
  data: T,
  options: {
    priority?: number;
    delay?: number;
    deduplicationId?: string;
  } = {},
): Promise<string | undefined> {
  const queue = getQueue(queueName);
  const jobOptions: Record<string, unknown> = {};

  if (options.priority) jobOptions.priority = options.priority;
  if (options.delay) jobOptions.delay = options.delay;
  if (options.deduplicationId) jobOptions.jobId = options.deduplicationId;

  const job = await queue.add(queueName, data, jobOptions);
  return job.id;
}

export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  queues.clear();
  logger.info('All queues closed');
}
