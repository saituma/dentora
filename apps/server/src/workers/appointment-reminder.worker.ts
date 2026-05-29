import type { Job } from 'bullmq';
import { runWithTenantContext } from '../db/tenant-context.js';
import { sendDueReminder, type ReminderJobData } from '../modules/reminders/reminder.service.js';

export async function processAppointmentReminder(job: Job<ReminderJobData>): Promise<void> {
  const { tenantId, reminderId } = job.data;
  const maxAttempts = job.opts.attempts ?? 3;
  const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
  await runWithTenantContext({ tenantId, source: 'worker' }, () =>
    sendDueReminder({ tenantId, reminderId, isFinalAttempt }),
  );
}
