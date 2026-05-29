/**
 * Appointment reminder scheduling + sending.
 *
 * Flow:
 *  1. scheduleAppointmentReminders() runs when an appointment is booked (inside tenant context).
 *     It inserts one appointment_reminders row per (channel, offset) and enqueues a delayed
 *     BullMQ job for each.
 *  2. When the delay elapses, the worker calls sendDueReminder(), which re-validates the
 *     appointment + patient consent at send time and dispatches via SMS/WhatsApp.
 *
 * Safety / GDPR:
 *  - Gated by the FF_APPOINTMENT_REMINDERS feature flag (off by default).
 *  - A reminder is only sent if the patient has messagingConsent=true and has not opted out.
 *  - All sending honours env.TWILIO_DRY_RUN (see lib/twilio-messaging.ts).
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { appointmentReminders, appointments, patientProfiles } from '../../db/schema.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { decryptField } from '../../lib/encrypted-column.js';
import { features } from '../../config/features.js';
import { logger } from '../../lib/logger.js';
import { enqueueJob, QUEUE_NAMES } from '../../lib/queue.js';
import { sendPatientMessage, type MessageChannel } from '../../lib/twilio-messaging.js';
import { getPatientProfileById } from '../patients/patients.service.js';
import { getClinicProfile } from '../config/config.service.js';

/** Default lead times (hours before the appointment) at which reminders fire. */
export const DEFAULT_REMINDER_OFFSETS_HOURS = [24];

/** Send-failure reasons that are configuration issues, not transient — do not retry these. */
const NON_RETRYABLE_REASONS = new Set([
  'no_whatsapp_sender_configured',
  'no_active_sms_capable_number',
]);

export type ReminderJobData = {
  tenantId: string;
  reminderId: string;
};

/** Resolves which channels to schedule from the patient's stored preference. */
function channelsForPreference(preference: string): MessageChannel[] {
  switch (preference) {
    case 'none':
      return [];
    case 'whatsapp':
      return ['whatsapp'];
    case 'both':
      return ['sms', 'whatsapp'];
    case 'sms':
    default:
      return ['sms'];
  }
}

/**
 * Schedules reminders for a freshly-booked appointment. Best-effort: never throws into the
 * booking path — a reminder-scheduling failure must not fail the booking itself.
 */
export async function scheduleAppointmentReminders(input: {
  tenantId: string;
  appointmentId: string;
  patientId: string;
  startAt: Date;
  offsetsHours?: number[];
  channels?: MessageChannel[];
}): Promise<void> {
  if (!features.appointmentReminders) return;
  assertTenantAccess(input.tenantId);

  try {
    const patient = await getPatientProfileById({
      tenantId: input.tenantId,
      patientId: input.patientId,
    });
    if (!patient) return;

    const channels = input.channels ?? channelsForPreference(patient.preferredReminderChannel);
    if (channels.length === 0) return;

    const offsets = input.offsetsHours ?? DEFAULT_REMINDER_OFFSETS_HOURS;
    const now = Date.now();

    for (const offsetHours of offsets) {
      const scheduledAt = new Date(input.startAt.getTime() - offsetHours * 60 * 60 * 1000);
      const delay = scheduledAt.getTime() - now;
      // Skip reminders whose fire time is already in the past (appointment booked too close).
      if (delay <= 0) continue;

      for (const channel of channels) {
        const [row] = await db
          .insert(appointmentReminders)
          .values({
            tenantId: input.tenantId,
            appointmentId: input.appointmentId,
            patientId: input.patientId,
            channel,
            offsetHours,
            scheduledAt,
          })
          .onConflictDoNothing({
            target: [
              appointmentReminders.tenantId,
              appointmentReminders.appointmentId,
              appointmentReminders.channel,
              appointmentReminders.offsetHours,
            ],
          })
          .returning();

        // onConflictDoNothing returns nothing if the reminder was already scheduled.
        if (!row) continue;

        await enqueueJob<ReminderJobData>(
          QUEUE_NAMES.APPOINTMENT_REMINDERS,
          { tenantId: input.tenantId, reminderId: row.id },
          { delay, deduplicationId: `reminder:${row.id}` },
        );
      }
    }
  } catch (err) {
    logger.error(
      { err, tenantId: input.tenantId, appointmentId: input.appointmentId },
      'Failed to schedule appointment reminders',
    );
  }
}

function formatAppointmentWhen(startAt: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(startAt);
  } catch {
    return startAt.toISOString();
  }
}

async function markReminder(
  tenantId: string,
  reminderId: string,
  patch: Partial<typeof appointmentReminders.$inferInsert>,
): Promise<void> {
  await db
    .update(appointmentReminders)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(appointmentReminders.tenantId, tenantId), eq(appointmentReminders.id, reminderId)),
    );
}

/**
 * Sends a single due reminder. Called by the worker within tenant context.
 * Throws only on transient send failures so BullMQ retries; all other outcomes are recorded
 * as a terminal status (sent / skipped).
 */
export async function sendDueReminder(input: {
  tenantId: string;
  reminderId: string;
  /** True on the worker's last retry — record a terminal `failed` status instead of `pending`. */
  isFinalAttempt?: boolean;
}): Promise<void> {
  assertTenantAccess(input.tenantId);

  const [reminder] = await db
    .select()
    .from(appointmentReminders)
    .where(
      and(
        eq(appointmentReminders.tenantId, input.tenantId),
        eq(appointmentReminders.id, input.reminderId),
      ),
    )
    .limit(1);

  if (!reminder) {
    logger.warn({ tenantId: input.tenantId, reminderId: input.reminderId }, 'Reminder not found');
    return;
  }
  // Idempotent: a retried job for an already-resolved reminder is a no-op.
  if (reminder.status !== 'pending') return;

  const [appointment] = await db
    .select()
    .from(appointments)
    .where(
      and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, reminder.appointmentId)),
    )
    .limit(1);

  if (!appointment || ['cancelled', 'no_show', 'completed'].includes(appointment.status)) {
    await markReminder(input.tenantId, reminder.id, {
      status: 'skipped',
      failureReason: appointment ? `appointment_${appointment.status}` : 'appointment_missing',
    });
    return;
  }

  const patient = await getPatientProfileById({
    tenantId: input.tenantId,
    patientId: reminder.patientId,
  });

  if (!patient) {
    await markReminder(input.tenantId, reminder.id, {
      status: 'skipped',
      failureReason: 'patient_missing',
    });
    return;
  }

  // GDPR gate: no consent, opted out, or preference turned off → never send.
  const channelAllowed = channelsForPreference(patient.preferredReminderChannel).includes(
    reminder.channel,
  );
  if (!patient.messagingConsent || patient.messagingOptedOutAt || !channelAllowed) {
    await markReminder(input.tenantId, reminder.id, {
      status: 'skipped',
      failureReason: !patient.messagingConsent
        ? 'no_consent'
        : patient.messagingOptedOutAt
          ? 'opted_out'
          : 'channel_not_preferred',
    });
    return;
  }

  if (!patient.phoneNumber) {
    await markReminder(input.tenantId, reminder.id, {
      status: 'skipped',
      failureReason: 'no_phone_number',
    });
    return;
  }

  const clinic = await getClinicProfile(input.tenantId);
  const clinicName = clinic?.clinicName ?? 'your dental practice';
  const when = formatAppointmentWhen(appointment.startAt, appointment.timezone);
  const body = `${clinicName}: Hi ${patient.fullName}, this is a reminder of your dental appointment on ${when}. Reply STOP to opt out.`;

  const result = await sendPatientMessage({
    tenantId: input.tenantId,
    channel: reminder.channel,
    to: patient.phoneNumber,
    body,
  });

  if (result.sent) {
    await markReminder(input.tenantId, reminder.id, {
      status: 'sent',
      sentAt: new Date(),
      twilioMessageSid: result.messageSid ?? null,
      metadata: result.dryRun ? { dryRun: true } : {},
    });
    return;
  }

  if (NON_RETRYABLE_REASONS.has(result.reason)) {
    await markReminder(input.tenantId, reminder.id, {
      status: 'skipped',
      failureReason: result.reason,
    });
    return;
  }

  // Transient failure — keep `pending` so a retry reprocesses it, but on the final attempt record
  // a terminal `failed` status so the dashboard doesn't show it as forever-pending. Rethrow either
  // way so BullMQ retries / forwards to the dead-letter queue.
  await markReminder(input.tenantId, reminder.id, {
    status: input.isFinalAttempt ? 'failed' : 'pending',
    failureReason: result.reason,
  });
  throw new Error(`Reminder send failed: ${result.reason}`);
}

export type ReminderListItem = {
  id: string;
  channel: string;
  status: string;
  scheduledAt: Date;
  sentAt: Date | null;
  failureReason: string | null;
  appointmentId: string;
  patientName: string;
};

/**
 * Lists recent reminders for the tenant dashboard (most recent first). Read-only.
 * Patient names are decrypted for display; no message bodies or phone numbers are returned.
 */
export async function listReminders(input: {
  tenantId: string;
  limit?: number;
}): Promise<ReminderListItem[]> {
  assertTenantAccess(input.tenantId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  const rows = await db
    .select({
      id: appointmentReminders.id,
      channel: appointmentReminders.channel,
      status: appointmentReminders.status,
      scheduledAt: appointmentReminders.scheduledAt,
      sentAt: appointmentReminders.sentAt,
      failureReason: appointmentReminders.failureReason,
      appointmentId: appointmentReminders.appointmentId,
      patientName: patientProfiles.fullName,
    })
    .from(appointmentReminders)
    .leftJoin(patientProfiles, eq(appointmentReminders.patientId, patientProfiles.id))
    .where(eq(appointmentReminders.tenantId, input.tenantId))
    .orderBy(desc(appointmentReminders.scheduledAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    status: row.status,
    scheduledAt: row.scheduledAt,
    sentAt: row.sentAt,
    failureReason: row.failureReason,
    appointmentId: row.appointmentId,
    patientName: decryptField(row.patientName) ?? 'Unknown',
  }));
}
