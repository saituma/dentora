import {
  Queue,
  Worker,
  type Job,
  type WorkerOptions,
  type QueueOptions,
  type ConnectionOptions,
} from 'bullmq';
import Redis from 'ioredis';
import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { bullmqJobsTotal } from './metrics.js';

const tracer = trace.getTracer('bullmq');

// ONE shared Redis connection for all BullMQ queues + workers.
//  - TLS: prod is rediss:// (Heroku Redis). The previous config parsed only
//    host/port/password and dropped TLS, so every BullMQ connection to the TLS-only
//    Redis was reset (ECONNRESET). Mirror the cache client and pass tls.
//  - Connection budget: Heroku Redis maxclients is ~18. One connection per
//    queue/worker would exceed it; sharing keeps the count low (each Worker still
//    opens its own blocking connection internally, but Queues all reuse this one).
//  - maxRetriesPerRequest must be null for BullMQ blocking commands.
const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
});
// Cast bridges a duplicate-ioredis-version type skew (app's ioredis vs BullMQ's);
// the instance is API-compatible at runtime.
const connection = redisConnection as unknown as ConnectionOptions;

export const QUEUE_NAMES = {
  COST_ATTRIBUTION: 'cost-attribution',
  ANALYTICS_EVENTS: 'analytics-events',
  INTEGRATION_CALLBACKS: 'integration-callbacks',
  NOTIFICATION_DELIVERY: 'notification-delivery',
  CONFIG_VALIDATION: 'config-validation',
  RECORDING_PROCESSING: 'recording-processing',
  DAILY_AGGREGATION: 'daily-aggregation',
  APPOINTMENT_MAINTENANCE: 'appointment-maintenance',
  APPOINTMENT_REMINDERS: 'appointment-reminders',
  DEPOSIT_COLLECTION: 'deposit-collection',
  DEAD_LETTER: 'dead-letter',
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
      const span = tracer.startSpan(`bullmq.process ${queueName}`, {
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.destination': queueName,
          'messaging.message_id': job.id ?? '',
          'job.tenant_id': tenantId,
          'job.attempt': job.attemptsMade + 1,
        },
      });
      try {
        await context.with(trace.setSpan(context.active(), span), () => processor(job));
        span.setStatus({ code: SpanStatusCode.OK });
        bullmqJobsTotal.inc({ queue: queueName, outcome: 'success' });
        jobLogger.info('Job completed');
      } catch (err) {
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        bullmqJobsTotal.inc({ queue: queueName, outcome: 'failure' });
        jobLogger.error({ err }, 'Job failed');
        throw err;
      } finally {
        span.end();
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
        'Job exhausted retries — forwarding to dead-letter queue',
      );
      // Forward to DLQ so ops can inspect/replay without digging through BullMQ failed state
      getQueue(QUEUE_NAMES.DEAD_LETTER)
        .add(
          'dead-letter',
          {
            originalQueue: queueName,
            originalJobId: job.id,
            data: job.data,
            failedReason: err instanceof Error ? err.message : String(err),
            failedAt: new Date().toISOString(),
            tenantId: (job.data as { tenantId?: string }).tenantId ?? 'unknown',
          },
          { removeOnComplete: { count: 500 }, removeOnFail: { count: 500 } },
        )
        .catch((dlqErr) => {
          logger.error({ dlqErr, jobId: job.id }, 'Failed to enqueue to dead-letter queue');
        });
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
  await redisConnection.quit().catch(() => undefined);
  logger.info('All queues closed');
}
