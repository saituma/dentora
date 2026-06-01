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
import { runDataRetention } from './lib/data-retention.js';
import { runLockedAppointmentMaintenance } from './modules/appointments/appointment-maintenance.service.js';
import { env } from './config/env.js';
import { listActiveTenantIdsForMaintenance } from './modules/tenants/tenant.service.js';
import { getClinicProfile } from './modules/config/config.service.js';
import { runWithTenantContext } from './db/tenant-context.js';
import {
  sendStaffReviewAlerts,
  sendStaffReviewDailyDigest,
} from './modules/staff-review/staff-review-notification.service.js';
import { processCostAttribution } from './workers/cost-attribution.worker.js';
import { processAnalyticsEvent } from './workers/analytics-events.worker.js';
import { processNotificationDelivery } from './workers/notification-delivery.worker.js';
import { processAppointmentReminder } from './workers/appointment-reminder.worker.js';
import { processDepositCollection } from './workers/deposit-collection.worker.js';
import {
  initTelegramDispatcher,
  notifyOps,
  buildStatusReport,
  runHealthWatch,
} from './modules/ops-telegram/index.js';
import { sendTelegramMessage } from './lib/telegram.js';

const workers: Array<{ close: () => Promise<void> }> = [];

export async function startBackgroundWorkers(opts: { initInfra?: boolean } = {}): Promise<void> {
  // When co-located in the web process (no separate worker dyno), telemetry, Redis,
  // and the log→Telegram dispatcher are already initialised by index.ts. Only a
  // standalone worker process initialises its own infra.
  if (opts.initInfra) {
    initTelegramDispatcher();
    try {
      await initRedis();
      logger.info('Redis connected');
    } catch (err) {
      logger.error({ err }, 'Redis connection failed — worker cannot start without Redis');
      process.exit(1);
    }
  }
  logger.info('Background workers starting');

  const { createWorker } = await import('./lib/queue.js');

  // ── Phase 3 workers ─────────────────────────────────────────────────────────
  workers.push(
    createWorker(QUEUE_NAMES.COST_ATTRIBUTION, processCostAttribution, { concurrency: 10 }),
    createWorker(QUEUE_NAMES.ANALYTICS_EVENTS, processAnalyticsEvent, { concurrency: 20 }),
    createWorker(QUEUE_NAMES.NOTIFICATION_DELIVERY, processNotificationDelivery, {
      concurrency: 5,
    }),
    createWorker(QUEUE_NAMES.APPOINTMENT_REMINDERS, processAppointmentReminder, {
      concurrency: 5,
    }),
    createWorker(QUEUE_NAMES.DEPOSIT_COLLECTION, processDepositCollection, {
      concurrency: 5,
    }),
  );

  // Dead-letter queue monitor — log DLQ jobs for alerting via log aggregation
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

  type AppointmentMaintenanceJobData = {
    tenantId: string;
  };
  const appointmentMaintenanceWorker = createWorker<AppointmentMaintenanceJobData>(
    QUEUE_NAMES.APPOINTMENT_MAINTENANCE,
    async () => {
      const result = await runLockedAppointmentMaintenance();
      logger.info(result, 'Appointment maintenance job complete');
    },
    { concurrency: 1 },
  );
  workers.push(appointmentMaintenanceWorker);

  // Daily data retention — runs once at startup then every 24 h
  async function scheduleDataRetention(): Promise<void> {
    try {
      const result = await runDataRetention();
      logger.info(result, 'Scheduled data retention complete');
    } catch (err) {
      logger.error({ err }, 'Scheduled data retention failed');
    }
    setTimeout(scheduleDataRetention, 24 * 60 * 60 * 1000);
  }
  scheduleDataRetention().catch(() => undefined);

  async function scheduleAppointmentMaintenance(): Promise<void> {
    try {
      const result = await runLockedAppointmentMaintenance();
      logger.info(result, 'Scheduled appointment maintenance complete');
    } catch (err) {
      logger.error({ err }, 'Scheduled appointment maintenance failed');
    }
    setTimeout(scheduleAppointmentMaintenance, 15 * 60 * 1000);
  }
  scheduleAppointmentMaintenance().catch(() => undefined);

  const dashboardUrl = `${env.CLIENT_URL}/dashboard/staff-review`;
  const tenantPageSize = 100;

  async function runStaffReviewAlerts(): Promise<void> {
    for (let offset = 0; ; offset += tenantPageSize) {
      const tenantIds = await listActiveTenantIdsForMaintenance({
        limit: tenantPageSize,
        offset,
      });
      if (tenantIds.length === 0) break;
      for (const tenantId of tenantIds) {
        try {
          const profile = await runWithTenantContext({ tenantId, source: 'worker' }, () =>
            getClinicProfile(tenantId),
          );
          const staffEmail = profile?.email ?? null;
          if (!staffEmail) continue;
          await sendStaffReviewAlerts({ tenantId, staffEmail, dashboardUrl });
        } catch (err) {
          logger.error({ tenantId, err }, 'Staff review alert run failed for tenant');
        }
      }
      if (tenantIds.length < tenantPageSize) break;
    }
  }

  async function scheduleStaffReviewAlerts(): Promise<void> {
    try {
      await runStaffReviewAlerts();
    } catch (err) {
      logger.error({ err }, 'Staff review alert schedule failed');
    }
    setTimeout(scheduleStaffReviewAlerts, 60 * 60 * 1000); // every hour
  }
  scheduleStaffReviewAlerts().catch(() => undefined);

  async function runStaffReviewDailyDigest(): Promise<void> {
    for (let offset = 0; ; offset += tenantPageSize) {
      const tenantIds = await listActiveTenantIdsForMaintenance({
        limit: tenantPageSize,
        offset,
      });
      if (tenantIds.length === 0) break;
      for (const tenantId of tenantIds) {
        try {
          const profile = await runWithTenantContext({ tenantId, source: 'worker' }, () =>
            getClinicProfile(tenantId),
          );
          const staffEmail = profile?.email ?? null;
          if (!staffEmail) continue;
          await sendStaffReviewDailyDigest({ tenantId, staffEmail, dashboardUrl });
        } catch (err) {
          logger.error({ tenantId, err }, 'Staff review daily digest failed for tenant');
        }
      }
      if (tenantIds.length < tenantPageSize) break;
    }
  }

  async function scheduleStaffReviewDailyDigest(): Promise<void> {
    try {
      await runStaffReviewDailyDigest();
    } catch (err) {
      logger.error({ err }, 'Staff review daily digest schedule failed');
    }
    setTimeout(scheduleStaffReviewDailyDigest, 24 * 60 * 60 * 1000); // every 24 hours
  }
  scheduleStaffReviewDailyDigest().catch(() => undefined);

  // Heartbeat — sends a status report every 6 hours so silence = something's wrong
  async function scheduleHeartbeat(): Promise<void> {
    try {
      const report = await buildStatusReport();
      await sendTelegramMessage(report);
    } catch (err) {
      logger.warn({ err }, 'Heartbeat failed');
    }
    setTimeout(scheduleHeartbeat, 6 * 60 * 60 * 1000);
  }
  scheduleHeartbeat().catch(() => undefined);

  // Proactive health watch — edge-triggered alerts every 2 minutes
  async function scheduleHealthWatch(): Promise<void> {
    try {
      await runHealthWatch();
    } catch (err) {
      logger.warn({ err }, 'Health watch failed');
    }
    setTimeout(scheduleHealthWatch, 2 * 60 * 1000);
  }
  scheduleHealthWatch().catch(() => undefined);

  logger.info({ queues: Object.values(QUEUE_NAMES) }, 'Worker process ready');
  notifyOps({ category: 'LIFECYCLE', title: '🚀 Worker process ready' }).catch(() => undefined);
}

/** Close BullMQ workers + queues. Redis/telemetry are owned by the host process. */
export async function stopBackgroundWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
  await closeAllQueues();
}

// Standalone worker-process entry — only when run as a dedicated worker dyno
// (WORKER_STANDALONE=true). In the current single-dyno setup the web process calls
// startBackgroundWorkers() directly, so this block stays dormant on import.
if (process.env.WORKER_STANDALONE === 'true') {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Worker shutdown signal received');
    notifyOps({ category: 'LIFECYCLE', title: `🛑 Worker shutting down (${signal})` }).catch(
      () => undefined,
    );
    await stopBackgroundWorkers();
    await closeRedis();
    if (process.env.OTEL_ENABLED === 'true') {
      await shutdownTelemetry();
    }
    logger.info('Worker process exited cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled rejection in worker');
    notifyOps({
      category: 'ERROR',
      title: 'Unhandled rejection in worker',
      detail: String(reason).slice(0, 300),
    }).catch(() => undefined);
  });

  startBackgroundWorkers({ initInfra: true }).catch((err) => {
    logger.error({ err }, 'Worker failed to start');
    process.exit(1);
  });
}
