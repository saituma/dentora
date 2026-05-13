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
