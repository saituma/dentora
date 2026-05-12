/**
 * Standalone BullMQ worker process.
 * Run in a separate container so heavy job processing doesn't compete with
 * HTTP request handling. Add concrete processors here as job types are wired up.
 */
import './lib/telemetry.js'; // must be first
import { logger } from './lib/logger.js';
import { initRedis, closeRedis } from './lib/cache.js';
import { closeAllQueues, QUEUE_NAMES } from './lib/queue.js';
import { shutdownTelemetry } from './lib/telemetry.js';

const workers: Array<{ close: () => Promise<void> }> = [];

async function start(): Promise<void> {
  logger.info('Worker process starting');

  try {
    await initRedis();
    logger.info('Redis connected');
  } catch (err) {
    logger.error({ err }, 'Redis connection failed — worker cannot start without Redis');
    process.exit(1);
  }

  // Register workers here as job processors are implemented.
  // Example:
  // workers.push(
  //   createWorker(QUEUE_NAMES.RECORDING_PROCESSING, processRecording),
  //   createWorker(QUEUE_NAMES.NOTIFICATION_DELIVERY, processNotification),
  // );
  //
  // Dead-letter queue monitor — log DLQ jobs for alerting via log aggregation
  // (Datadog/Sentry picks these up via structured log fields)
  const { createWorker } = await import('./lib/queue.js');
  type DlqJobData = {
    tenantId: string;
    originalQueue: string;
    originalJobId: string | undefined;
    data: unknown;
    failedReason: string;
    failedAt: string;
  };
  const dlqWorker = createWorker<DlqJobData>(
    QUEUE_NAMES.DEAD_LETTER,
    async (job) => {
      logger.error(
        {
          originalQueue: job.data.originalQueue,
          originalJobId: job.data.originalJobId,
          tenantId: job.data.tenantId,
          failedReason: job.data.failedReason,
          failedAt: job.data.failedAt,
        },
        'Dead-letter job received — manual intervention may be required',
      );
    },
    { concurrency: 1 },
  );
  workers.push(dlqWorker);

  logger.info({ queues: Object.values(QUEUE_NAMES) }, 'Worker process ready');
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutdown signal received');

  await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
  await closeAllQueues();
  await closeRedis();

  if (process.env.OTEL_ENABLED === 'true') {
    await shutdownTelemetry();
  }

  logger.info('Worker process exited cleanly');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection in worker');
});

start().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
