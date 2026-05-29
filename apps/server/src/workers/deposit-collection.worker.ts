import type { Job } from 'bullmq';
import { runWithTenantContext } from '../db/tenant-context.js';
import { createAndSendDeposit, type DepositJobData } from '../modules/deposits/deposit.service.js';

export async function processDepositCollection(job: Job<DepositJobData>): Promise<void> {
  const { tenantId, appointmentId, patientId, startAtIso } = job.data;
  await runWithTenantContext({ tenantId, source: 'worker' }, () =>
    createAndSendDeposit({
      tenantId,
      appointmentId,
      patientId,
      startAt: new Date(startAtIso),
    }),
  );
}
