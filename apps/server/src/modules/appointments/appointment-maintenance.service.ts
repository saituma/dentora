import { runWithTenantContext } from '../../db/tenant-context.js';
import { features } from '../../config/features.js';
import { acquireDistributedLock } from '../../lib/distributed-lock.js';
import { logger } from '../../lib/logger.js';
import { listActiveTenantIdsForMaintenance } from '../tenants/tenant.service.js';
import { expireAppointmentHolds } from './appointment-ledger.service.js';
import {
  findReconciliationRetryCandidates,
  processAppointmentReconciliationCandidate,
} from './appointment-reconciliation.service.js';
import {
  APPOINTMENT_MAINTENANCE_COMPONENT,
  recordOperationalHealthFailure,
  recordOperationalHealthStarted,
  recordOperationalHealthSuccess,
  type AppointmentMaintenanceHealthMetadata,
} from '../operational-health/operational-health.service.js';

export interface AppointmentMaintenanceInput {
  now?: Date;
  tenantPageSize?: number;
  holdCleanupLimit?: number;
  reconciliationLimit?: number;
}

export interface LockedAppointmentMaintenanceInput extends AppointmentMaintenanceInput {
  lockKey?: string;
  lockTtlMs?: number;
}

export interface AppointmentTenantMaintenanceResult {
  tenantId: string;
  expiredHoldCount: number;
  reconciliationCandidateCount: number;
  reconciliationProcessedCount: number;
  error?: string;
}

export interface AppointmentMaintenanceResult {
  tenantCount: number;
  expiredHoldCount: number;
  reconciliationCandidateCount: number;
  reconciliationProcessedCount: number;
  failedTenantCount: number;
  tenants: AppointmentTenantMaintenanceResult[];
}

export interface LockedAppointmentMaintenanceResult {
  ran: boolean;
  lockKey: string;
  skippedReason?: 'lock_held' | 'redis_unavailable';
  result?: AppointmentMaintenanceResult;
}

export const APPOINTMENT_MAINTENANCE_LOCK_KEY = 'lock:appointment-maintenance';
const DEFAULT_APPOINTMENT_MAINTENANCE_LOCK_TTL_MS = 14 * 60 * 1000;

async function runTenantAppointmentMaintenance(input: {
  tenantId: string;
  now: Date;
  holdCleanupLimit: number;
  reconciliationLimit: number;
}): Promise<AppointmentTenantMaintenanceResult> {
  return await runWithTenantContext({ tenantId: input.tenantId, source: 'worker' }, async () => {
    const expiredHolds = await expireAppointmentHolds({
      tenantId: input.tenantId,
      now: input.now,
      limit: input.holdCleanupLimit,
    });
    const reconciliationCandidates = await findReconciliationRetryCandidates({
      tenantId: input.tenantId,
      now: input.now,
      limit: input.reconciliationLimit,
    });

    let reconciliationProcessedCount = 0;
    for (const appointment of reconciliationCandidates) {
      logger.warn(
        {
          tenantId: input.tenantId,
          appointmentId: appointment.id,
          externalCalendarEventId: appointment.externalCalendarEventId,
          reconciliation: appointment.metadata,
        },
        'Appointment reconciliation candidate discovered',
      );

      if (!features.appointmentReconciliationProcessor) continue;

      logger.info(
        { tenantId: input.tenantId, appointmentId: appointment.id },
        'Appointment reconciliation processing started',
      );
      const result = await processAppointmentReconciliationCandidate({
        tenantId: input.tenantId,
        appointment,
        now: input.now,
      });
      reconciliationProcessedCount += 1;
      const logContext = {
        tenantId: input.tenantId,
        appointmentId: appointment.id,
        result,
      };
      if (result.status === 'resolved') {
        logger.info(logContext, 'Appointment reconciliation processing resolved');
      } else if (result.status === 'retry_scheduled') {
        logger.warn(logContext, 'Appointment reconciliation retry scheduled');
      } else {
        logger.error(logContext, 'Appointment reconciliation processing failed');
      }
    }

    return {
      tenantId: input.tenantId,
      expiredHoldCount: expiredHolds.length,
      reconciliationCandidateCount: reconciliationCandidates.length,
      reconciliationProcessedCount,
    };
  });
}

export async function runAppointmentMaintenance(
  input: AppointmentMaintenanceInput = {},
): Promise<AppointmentMaintenanceResult> {
  const now = input.now ?? new Date();
  const tenantPageSize = Math.min(Math.max(input.tenantPageSize ?? 100, 1), 500);
  const holdCleanupLimit = Math.min(Math.max(input.holdCleanupLimit ?? 100, 1), 500);
  const reconciliationLimit = Math.min(Math.max(input.reconciliationLimit ?? 100, 1), 500);
  const tenants: AppointmentTenantMaintenanceResult[] = [];

  for (let offset = 0; ; offset += tenantPageSize) {
    const tenantIds = await listActiveTenantIdsForMaintenance({
      limit: tenantPageSize,
      offset,
    });
    if (tenantIds.length === 0) break;

    for (const tenantId of tenantIds) {
      try {
        tenants.push(
          await runTenantAppointmentMaintenance({
            tenantId,
            now,
            holdCleanupLimit,
            reconciliationLimit,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ tenantId, err: error }, 'Appointment maintenance failed for tenant');
        tenants.push({
          tenantId,
          expiredHoldCount: 0,
          reconciliationCandidateCount: 0,
          reconciliationProcessedCount: 0,
          error: message,
        });
      }
    }

    if (tenantIds.length < tenantPageSize) break;
  }

  return {
    tenantCount: tenants.length,
    expiredHoldCount: tenants.reduce((sum, tenant) => sum + tenant.expiredHoldCount, 0),
    reconciliationCandidateCount: tenants.reduce(
      (sum, tenant) => sum + tenant.reconciliationCandidateCount,
      0,
    ),
    reconciliationProcessedCount: tenants.reduce(
      (sum, tenant) => sum + tenant.reconciliationProcessedCount,
      0,
    ),
    failedTenantCount: tenants.filter((tenant) => tenant.error).length,
    tenants,
  };
}

function buildAppointmentMaintenanceHealthMetadata(input: {
  result: AppointmentMaintenanceResult;
  startedAt: Date;
  completedAt: Date;
}): AppointmentMaintenanceHealthMetadata {
  return {
    tenantsProcessed: input.result.tenantCount,
    tenantsFailed: input.result.failedTenantCount,
    holdsExpired: input.result.expiredHoldCount,
    reconciliationCandidatesFound: input.result.reconciliationCandidateCount,
    reconciliationCandidatesProcessed: input.result.reconciliationProcessedCount,
    durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
  };
}

export async function runLockedAppointmentMaintenance(
  input: LockedAppointmentMaintenanceInput = {},
): Promise<LockedAppointmentMaintenanceResult> {
  const lockKey = input.lockKey ?? APPOINTMENT_MAINTENANCE_LOCK_KEY;
  const lock = await acquireDistributedLock({
    key: lockKey,
    ttlMs: input.lockTtlMs ?? DEFAULT_APPOINTMENT_MAINTENANCE_LOCK_TTL_MS,
  });

  if (!lock.acquired) {
    if (lock.reason === 'lock_held') {
      logger.info({ lockKey }, 'Appointment maintenance skipped because lock is held');
    } else {
      logger.error(
        { lockKey, err: lock.error },
        'Appointment maintenance skipped because Redis lock is unavailable',
      );
    }

    return {
      ran: false,
      lockKey,
      skippedReason: lock.reason,
    };
  }

  try {
    const startedAt = input.now ?? new Date();
    await recordOperationalHealthStarted({
      component: APPOINTMENT_MAINTENANCE_COMPONENT,
      now: startedAt,
    });
    const result = await runAppointmentMaintenance(input);
    const completedAt = new Date();
    await recordOperationalHealthSuccess({
      component: APPOINTMENT_MAINTENANCE_COMPONENT,
      now: completedAt,
      metadata: {
        ...buildAppointmentMaintenanceHealthMetadata({
          result,
          startedAt,
          completedAt,
        }),
      },
    });
    return {
      ran: true,
      lockKey,
      result,
    };
  } catch (error) {
    await recordOperationalHealthFailure({
      component: APPOINTMENT_MAINTENANCE_COMPONENT,
      error,
      metadata: { phase: 'maintenance_run' },
    });
    throw error;
  } finally {
    const released = await lock.release();
    if (!released) {
      logger.warn({ lockKey }, 'Appointment maintenance lock was not released by owner');
    }
  }
}
