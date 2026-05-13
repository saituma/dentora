import { runWithTenantContext } from '../../db/tenant-context.js';
import { logger } from '../../lib/logger.js';
import { listActiveTenantIdsForMaintenance } from '../tenants/tenant.service.js';
import { expireAppointmentHolds } from './appointment-ledger.service.js';
import { findReconciliationRetryCandidates } from './appointment-reconciliation.service.js';

export interface AppointmentMaintenanceInput {
  now?: Date;
  tenantPageSize?: number;
  holdCleanupLimit?: number;
  reconciliationLimit?: number;
}

export interface AppointmentTenantMaintenanceResult {
  tenantId: string;
  expiredHoldCount: number;
  reconciliationCandidateCount: number;
  error?: string;
}

export interface AppointmentMaintenanceResult {
  tenantCount: number;
  expiredHoldCount: number;
  reconciliationCandidateCount: number;
  failedTenantCount: number;
  tenants: AppointmentTenantMaintenanceResult[];
}

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
    }

    return {
      tenantId: input.tenantId,
      expiredHoldCount: expiredHolds.length,
      reconciliationCandidateCount: reconciliationCandidates.length,
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
    failedTenantCount: tenants.filter((tenant) => tenant.error).length,
    tenants,
  };
}
