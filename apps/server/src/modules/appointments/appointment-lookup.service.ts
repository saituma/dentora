import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { appointments, patientProfiles } from '../../db/schema.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { hashForSearch } from '../../lib/encrypted-column.js';
import type { Appointment } from './appointment-ledger.service.js';
import { createStaffReviewItemSafely } from '../staff-review/staff-review.service.js';
import { makeDateInTimeZone } from './appointment-timezone.js';

export const APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE =
  'For privacy and security, I need your confirmation number or your phone number, date of birth, and appointment date/time before I can help with that.';

export const APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE =
  "I couldn't verify that appointment. Please contact the clinic directly or provide your confirmation details.";

export type AppointmentLookupFailureReason =
  | 'missing_verification'
  | 'not_found'
  | 'multiple_matches'
  | 'missing_external_event';

export type AppointmentLookupResult =
  | { success: true; appointment: Appointment; externalCalendarEventId: string }
  | { success: false; reason: AppointmentLookupFailureReason; message: string };

export interface AppointmentVerificationInput {
  tenantId: string;
  confirmationId?: string | null;
  appointmentId?: string | null;
  appAppointmentId?: string | null;
  externalCalendarEventId?: string | null;
  phoneNumber?: string | null;
  dateOfBirth?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  timezone?: string | null;
  operation?: 'check_appointment' | 'cancel_appointment' | 'reschedule_appointment' | null;
}

function trimmed(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseAppointmentDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parseAppointmentTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(value.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridiem = match[3]?.toLowerCase();
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (meridiem && (hour < 0 || hour > 23)) return null;
  return { hour, minute };
}

function makeUtcDateRange(input: {
  appointmentDate: string;
  appointmentTime: string;
  timezone?: string | null;
}): { from: Date; to: Date } | null {
  const date = parseAppointmentDate(input.appointmentDate);
  const time = parseAppointmentTime(input.appointmentTime);
  if (!date || !time) return null;

  const center = input.timezone
    ? makeDateInTimeZone(input.timezone, date.year, date.month, date.day, time.hour, time.minute)
    : new Date(Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute));
  const windowMs = 30 * 60 * 1000;
  return {
    from: new Date(center.getTime() - windowMs),
    to: new Date(center.getTime() + windowMs),
  };
}

function missingVerification(): AppointmentLookupResult {
  return {
    success: false,
    reason: 'missing_verification',
    message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
  };
}

async function recordVerificationBlock(input: {
  tenantId: string;
  operation?: string | null;
  reasonCode: string;
  message: string;
}): Promise<void> {
  await createStaffReviewItemSafely({
    tenantId: input.tenantId,
    type: 'ai_tool_safety_block',
    severity: 'medium',
    source: 'ai_tool',
    reasonCode: input.reasonCode,
    message: input.message,
    metadata: {
      operation: input.operation ?? 'appointment_change',
    },
    dedupeKey: `ai_tool_safety:${input.operation ?? 'appointment_change'}:${input.reasonCode}`,
  });
}

function notFound(): AppointmentLookupResult {
  return {
    success: false,
    reason: 'not_found',
    message: APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
  };
}

function multipleMatches(): AppointmentLookupResult {
  return {
    success: false,
    reason: 'multiple_matches',
    message: APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
  };
}

function toLookupSuccess(appointment: Appointment): AppointmentLookupResult {
  if (!appointment.externalCalendarEventId?.trim()) {
    return {
      success: false,
      reason: 'missing_external_event',
      message: APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
    };
  }
  return {
    success: true,
    appointment,
    externalCalendarEventId: appointment.externalCalendarEventId,
  };
}

async function findByAppointmentIdentifier(input: {
  tenantId: string;
  identifier: string;
}): Promise<AppointmentLookupResult> {
  const [byAppointmentId] = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, input.tenantId),
        eq(appointments.id, input.identifier),
        inArray(appointments.status, ['scheduled', 'confirmed']),
      ),
    )
    .limit(1);

  if (byAppointmentId) return toLookupSuccess(byAppointmentId);

  const [byExternalEventId] = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, input.tenantId),
        eq(appointments.externalCalendarEventId, input.identifier),
        inArray(appointments.status, ['scheduled', 'confirmed']),
      ),
    )
    .limit(1);

  return byExternalEventId ? toLookupSuccess(byExternalEventId) : notFound();
}

export async function resolveVerifiedAppointmentForCaller(
  input: AppointmentVerificationInput,
): Promise<AppointmentLookupResult> {
  assertTenantAccess(input.tenantId);

  const identifier =
    trimmed(input.confirmationId) ??
    trimmed(input.appointmentId) ??
    trimmed(input.appAppointmentId) ??
    trimmed(input.externalCalendarEventId);
  if (identifier) {
    return await findByAppointmentIdentifier({ tenantId: input.tenantId, identifier });
  }

  const phoneNumber = trimmed(input.phoneNumber);
  const dateOfBirth = trimmed(input.dateOfBirth);
  const appointmentDate = trimmed(input.appointmentDate);
  const appointmentTime = trimmed(input.appointmentTime);
  if (!phoneNumber || !dateOfBirth || !appointmentDate || !appointmentTime) {
    await recordVerificationBlock({
      tenantId: input.tenantId,
      operation: input.operation,
      reasonCode: 'APPOINTMENT_VERIFICATION_INCOMPLETE',
      message: 'Appointment change blocked because caller verification was incomplete.',
    });
    return missingVerification();
  }

  const range = makeUtcDateRange({
    appointmentDate,
    appointmentTime,
    timezone: trimmed(input.timezone),
  });
  if (!range) {
    await recordVerificationBlock({
      tenantId: input.tenantId,
      operation: input.operation,
      reasonCode: 'APPOINTMENT_VERIFICATION_INVALID_TIME',
      message: 'Appointment change blocked because appointment date/time verification was invalid.',
    });
    return missingVerification();
  }

  const phoneHash = hashForSearch(phoneNumber);
  const rows = await db
    .select({ appointment: appointments })
    .from(appointments)
    .innerJoin(patientProfiles, eq(appointments.patientId, patientProfiles.id))
    .where(
      and(
        eq(appointments.tenantId, input.tenantId),
        eq(patientProfiles.tenantId, input.tenantId),
        eq(patientProfiles.phoneNumberHash, phoneHash),
        eq(patientProfiles.dateOfBirth, dateOfBirth),
        inArray(appointments.status, ['scheduled', 'confirmed']),
        gte(appointments.startAt, range.from),
        lt(appointments.startAt, range.to),
      ),
    )
    .limit(2);

  if (rows.length === 0) return notFound();
  if (rows.length > 1) {
    await recordVerificationBlock({
      tenantId: input.tenantId,
      operation: input.operation,
      reasonCode: 'APPOINTMENT_VERIFICATION_MULTIPLE_MATCHES',
      message: 'Appointment change blocked because verification matched multiple appointments.',
    });
    return multipleMatches();
  }
  return toLookupSuccess(rows[0].appointment);
}
