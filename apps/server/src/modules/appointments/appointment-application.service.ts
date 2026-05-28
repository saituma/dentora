import { hashForSearch } from '../../lib/encrypted-column.js';
import { ValidationError } from '../../lib/errors.js';
import { features } from '../../config/features.js';
import * as configService from '../config/config.service.js';
import { upsertPatientProfile } from '../patients/patients.service.js';
import { createExternalEntityMapping } from '../pms/services/external-entity-mapping.service.js';
import { resolveActiveSchedulingProvider } from '../pms/services/scheduling-provider-resolver.service.js';
import type { RequestedPeriod, Slot } from '../pms/domain/appointment.types.js';
import {
  createAppointmentChangeReviewItem,
  CANCEL_REVIEW_MESSAGE,
  RESCHEDULE_REVIEW_MESSAGE,
} from './appointment-change-review.service.js';
import {
  attachExternalCalendarEvent,
  beginAppointmentCancellationByExternalEventId,
  beginAppointmentRescheduleByExternalEventId,
  confirmAppointmentHold,
  createAppointmentHold,
  getAppointmentByExternalCalendarEventId,
  markAppointmentExternalSyncState,
  markAppointmentReconciliationNeeded,
} from './appointment-ledger.service.js';
import {
  formatDateInTimeZone,
  formatTimeInTimeZone,
  makeDateInTimeZone,
} from './appointment-timezone.js';

export interface LedgerBackedAppointmentPatientInput {
  fullName: string;
  phoneNumber: string;
  reasonForVisit: string;
  dateOfBirth?: string | null;
  age?: number;
}

export interface LedgerBackedBookingInput {
  tenantId: string;
  slot: { startIso: string; endIso: string };
  patient: LedgerBackedAppointmentPatientInput;
  idempotencyKey?: string;
  summary?: string;
  source?: string;
}

export interface LedgerBackedBookingResult {
  eventId: string;
  htmlLink?: string;
  slot: Slot;
  appointmentId: string;
}

export interface AppointmentAvailabilityInput {
  tenantId: string;
  requestedDate: string;
  requestedTime?: string | null;
  requestedPeriod?: RequestedPeriod | null;
  appointmentDurationMinutes?: number;
  bufferBetweenAppointmentsMinutes?: number;
  operatingSchedule?: Record<string, unknown> | null;
  closedDates?: string[] | null;
  maxSlots?: number;
  lookAheadDays?: number;
  minimumStartAt?: Date;
}

export interface AppointmentAvailabilityResult {
  exactMatch: Slot | null;
  suggestedSlots: Slot[];
  timezone: string;
}

export interface PublicAppointmentBookingInput {
  tenantId: string;
  slot: { startIso: string; endIso: string };
  patient: LedgerBackedAppointmentPatientInput;
  idempotencyKey?: string;
}

export interface UpcomingAppointmentEvent {
  id: string;
  summary: string;
  description: string;
  htmlLink?: string;
  start: string;
  end: string;
  status: string;
}

export interface UpcomingAppointmentsResult {
  calendarId: string;
  events: UpcomingAppointmentEvent[];
}

function parseSlot(slot: { startIso: string; endIso: string }): { startAt: Date; endAt: Date } {
  const startAt = new Date(slot.startIso);
  const endAt = new Date(slot.endIso);
  if (
    !Number.isFinite(startAt.getTime()) ||
    !Number.isFinite(endAt.getTime()) ||
    endAt <= startAt
  ) {
    throw new ValidationError('Appointment start/end times are invalid');
  }
  return { startAt, endAt };
}

function dateFormatters(timezone: string): {
  dateFormatter: Intl.DateTimeFormat;
  timeFormatter: Intl.DateTimeFormat;
} {
  return {
    dateFormatter: new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
    timeFormatter: new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

function closedDatesFromRules(
  rules: { closedDates?: unknown } | null | undefined,
): string[] | null {
  return Array.isArray(rules?.closedDates)
    ? rules.closedDates.filter((value): value is string => typeof value === 'string')
    : null;
}

function normalizeRequestedClockTime(value?: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function findExactRequestedSlot(input: {
  slots: Slot[];
  timezone: string;
  requestedDate: string;
  requestedTime?: string | null;
}): Slot | null {
  const requestedTime = normalizeRequestedClockTime(input.requestedTime);
  if (!requestedTime) return null;

  return (
    input.slots.find((slot) => {
      const start = new Date(slot.startIso);
      if (!Number.isFinite(start.getTime())) return false;
      return (
        formatDateInTimeZone(start, input.timezone) === input.requestedDate &&
        formatTimeInTimeZone(start, input.timezone) === requestedTime
      );
    }) ?? null
  );
}

function calculatePublicAvailabilityFloor(timezone: string): Date {
  const now = new Date();
  const nowHour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false }).format(
      now,
    ),
  );
  if (nowHour >= 12) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [year, month, day] = formatDateInTimeZone(tomorrow, timezone).split('-').map(Number);
    return makeDateInTimeZone(timezone, year, month, day, 0, 0);
  }

  const [year, month, day] = formatDateInTimeZone(now, timezone).split('-').map(Number);
  return makeDateInTimeZone(timezone, year, month, day, 12, 0);
}

function assertPublicBookingRules(input: {
  slot: { startIso: string; endIso: string };
  patient: LedgerBackedAppointmentPatientInput;
  timezone: string;
  maxAdvanceBookingDays: number;
}): void {
  const { startAt } = parseSlot(input.slot);
  const maxStart = Date.now() + input.maxAdvanceBookingDays * 24 * 60 * 60 * 1000;
  const startDateLocal = formatDateInTimeZone(startAt, input.timezone);
  const todayLocal = formatDateInTimeZone(new Date(), input.timezone);
  const tomorrowLocal = formatDateInTimeZone(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
    input.timezone,
  );
  const isToday = startDateLocal === todayLocal;
  const isTomorrow = startDateLocal === tomorrowLocal;
  const nowHour = Number(formatTimeInTimeZone(new Date(), input.timezone).slice(0, 2));
  const startHour = Number(formatTimeInTimeZone(startAt, input.timezone).slice(0, 2));
  const reason = input.patient.reasonForVisit.toLowerCase();
  const isEmergency =
    /\b(emergency|severe|bleeding|trauma|swelling|broken|abscess|infection|fever|uncontrolled)\b/.test(
      reason,
    );

  if (isEmergency) {
    // Emergency bookings bypass same-day restrictions.
  } else if (isToday) {
    if (nowHour >= 12) {
      throw new ValidationError(
        'Same-day appointments are only available when booked in the morning',
      );
    }
    if (startHour < 12) {
      throw new ValidationError('Same-day appointments must be scheduled in the afternoon');
    }
  } else if (!isTomorrow) {
    // No min-notice enforcement for later dates on the public route.
  }

  if (startAt.getTime() > maxStart) {
    throw new ValidationError('Appointment time is too far in advance based on booking rules');
  }
}

export async function listUpcomingAppointments(input: {
  tenantId: string;
  days?: number;
}): Promise<UpcomingAppointmentsResult> {
  const scheduling = await resolveActiveSchedulingProvider({
    tenantId: input.tenantId,
    operation: 'read',
  });
  const result = await scheduling.provider.listAppointments({
    tenantId: input.tenantId,
    days: input.days,
    maxResults: 50,
  });

  return {
    calendarId: result.sourceId ?? scheduling.integrationId,
    events: result.appointments.map((appointment) => ({
      id: appointment.id,
      summary: appointment.summary,
      description: appointment.description ?? '',
      htmlLink: appointment.htmlLink,
      start: appointment.startIso,
      end: appointment.endIso,
      status: appointment.status,
    })),
  };
}

export async function verifySchedulingProviderAvailable(input: {
  tenantId: string;
  operation?: 'read' | 'write';
}): Promise<void> {
  await resolveActiveSchedulingProvider({
    tenantId: input.tenantId,
    operation: input.operation ?? 'read',
  });
}

export async function checkAppointmentAvailability(
  input: AppointmentAvailabilityInput,
): Promise<AppointmentAvailabilityResult> {
  const clinic = await configService.getClinicProfile(input.tenantId);
  const rules = await configService.getBookingRules(input.tenantId);

  if (!clinic?.timezone) {
    throw new ValidationError('Clinic timezone is required to check availability');
  }

  const scheduling = await resolveActiveSchedulingProvider({
    tenantId: input.tenantId,
    operation: 'read',
  });
  const suggestedSlots = await scheduling.provider.getAvailability({
    tenantId: input.tenantId,
    timezone: clinic.timezone,
    minimumStartAt: input.minimumStartAt,
    requestedDate: input.requestedDate,
    requestedTime: input.requestedTime ?? null,
    requestedPeriod: input.requestedPeriod ?? null,
    appointmentDurationMinutes:
      input.appointmentDurationMinutes ?? rules?.defaultAppointmentDurationMinutes ?? 30,
    bufferBetweenAppointmentsMinutes:
      input.bufferBetweenAppointmentsMinutes ?? rules?.bufferBetweenAppointmentsMinutes ?? 0,
    operatingSchedule:
      input.operatingSchedule ??
      ((rules?.operatingSchedule ?? clinic.businessHours ?? null) as Record<
        string,
        unknown
      > | null),
    closedDates: input.closedDates ?? closedDatesFromRules(rules),
    maxSlots: input.maxSlots ?? 5,
    lookAheadDays: input.lookAheadDays ?? 14,
  });

  return {
    exactMatch: findExactRequestedSlot({
      slots: suggestedSlots,
      timezone: clinic.timezone,
      requestedDate: input.requestedDate,
      requestedTime: input.requestedTime,
    }),
    suggestedSlots,
    timezone: clinic.timezone,
  };
}

export async function checkPublicAppointmentAvailability(input: {
  tenantId: string;
  requestedDate: string;
  requestedTime?: string | null;
  requestedPeriod?: RequestedPeriod | null;
  appointmentDurationMinutes?: number;
  maxSlots?: number;
  lookAheadDays?: number;
}): Promise<AppointmentAvailabilityResult> {
  const clinic = await configService.getClinicProfile(input.tenantId);
  const rules = await configService.getBookingRules(input.tenantId);

  if (!clinic?.timezone) {
    throw new ValidationError('Clinic timezone is required to check availability');
  }

  return await checkAppointmentAvailability({
    tenantId: input.tenantId,
    minimumStartAt: calculatePublicAvailabilityFloor(clinic.timezone),
    requestedDate: input.requestedDate,
    requestedTime: input.requestedTime,
    requestedPeriod: input.requestedPeriod,
    appointmentDurationMinutes:
      input.appointmentDurationMinutes ?? rules?.defaultAppointmentDurationMinutes ?? 30,
    bufferBetweenAppointmentsMinutes: rules?.bufferBetweenAppointmentsMinutes ?? 0,
    operatingSchedule: (rules?.operatingSchedule ?? clinic.businessHours ?? null) as Record<
      string,
      unknown
    > | null,
    closedDates: closedDatesFromRules(rules),
    maxSlots: input.maxSlots ?? 5,
    lookAheadDays: input.lookAheadDays ?? 14,
  });
}

export async function bookLedgerBackedAppointment(
  input: LedgerBackedBookingInput,
): Promise<LedgerBackedBookingResult> {
  const clinic = await configService.getClinicProfile(input.tenantId);
  const rules = await configService.getBookingRules(input.tenantId);

  if (!clinic?.timezone) {
    throw new ValidationError('Clinic timezone is required to book appointments');
  }

  const { startAt, endAt } = parseSlot(input.slot);
  const { dateFormatter, timeFormatter } = dateFormatters(clinic.timezone);
  const startDateLocal = dateFormatter.format(startAt);
  const closedDates = Array.isArray(rules?.closedDates)
    ? rules.closedDates.filter((value): value is string => typeof value === 'string')
    : null;

  const scheduling = await resolveActiveSchedulingProvider({
    tenantId: input.tenantId,
    operation: 'write',
  });

  const availableSlots = await scheduling.provider.getAvailability({
    tenantId: input.tenantId,
    timezone: clinic.timezone,
    requestedDate: startDateLocal,
    requestedTime: timeFormatter.format(startAt),
    requestedPeriod: null,
    appointmentDurationMinutes: Math.max(
      5,
      Math.round((endAt.getTime() - startAt.getTime()) / 60_000),
    ),
    bufferBetweenAppointmentsMinutes: rules?.bufferBetweenAppointmentsMinutes ?? 0,
    operatingSchedule: (rules?.operatingSchedule ?? clinic.businessHours ?? null) as Record<
      string,
      unknown
    > | null,
    closedDates,
    maxSlots: 1,
    lookAheadDays: 1,
  });

  const sameInstant = (a: string, b: string) => {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
  };

  const exactSlot = availableSlots.find(
    (slot) =>
      sameInstant(slot.startIso, input.slot.startIso) &&
      sameInstant(slot.endIso, input.slot.endIso),
  );
  if (
    !exactSlot ||
    !sameInstant(exactSlot.startIso, input.slot.startIso) ||
    !sameInstant(exactSlot.endIso, input.slot.endIso)
  ) {
    throw new ValidationError('Appointment slot is no longer available');
  }

  const patient = await upsertPatientProfile({
    tenantId: input.tenantId,
    fullName: input.patient.fullName,
    phoneNumber: input.patient.phoneNumber,
    dateOfBirth: input.patient.dateOfBirth ?? null,
    lastVisitAt: startAt,
    notes: input.patient.reasonForVisit,
  });

  const baseIdempotencyKey =
    input.idempotencyKey ??
    `book:${hashForSearch(
      [input.tenantId, input.slot.startIso, input.slot.endIso, input.patient.phoneNumber].join('|'),
    )}`;

  const hold = await createAppointmentHold({
    tenantId: input.tenantId,
    patientId: patient.id,
    startAt,
    endAt,
    timezone: clinic.timezone,
    calendarIntegrationId: scheduling.integrationId,
    idempotencyKey: `${baseIdempotencyKey}:hold`,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    metadata: { source: input.source ?? 'ai.telephony.book' },
  });
  const localAppointment = await confirmAppointmentHold({
    tenantId: input.tenantId,
    holdId: hold.id,
    idempotencyKey: `${baseIdempotencyKey}:confirm`,
  });

  if (localAppointment.externalCalendarEventId) {
    return {
      eventId: localAppointment.externalCalendarEventId,
      slot: exactSlot,
      appointmentId: localAppointment.id,
    };
  }

  const providerAppointment = await scheduling.provider.createAppointment({
    tenantId: input.tenantId,
    timezone: clinic.timezone,
    appAppointmentId: localAppointment.id,
    slot: input.slot,
    summary: input.summary ?? `Dental appointment - ${input.patient.fullName}`,
    patient: input.patient,
  });

  try {
    const providerPatientId =
      providerAppointment.externalPatientId ?? providerAppointment.patient?.externalId;
    const providerMetadata: Record<string, unknown> = {};
    if (providerPatientId) providerMetadata.externalPatientId = providerPatientId;
    if (providerAppointment.externalClinicianId) {
      providerMetadata.externalClinicianId = providerAppointment.externalClinicianId;
    }
    if (providerAppointment.externalRoomId) {
      providerMetadata.externalRoomId = providerAppointment.externalRoomId;
    }

    await attachExternalCalendarEvent({
      tenantId: input.tenantId,
      appointmentId: localAppointment.id,
      externalCalendarEventId: providerAppointment.id,
      externalProvider: scheduling.providerName,
      externalAppointmentId: providerAppointment.id,
      ...(providerPatientId ? { externalPatientId: providerPatientId } : {}),
      ...(providerAppointment.externalClinicianId
        ? { externalClinicianId: providerAppointment.externalClinicianId }
        : {}),
      ...(providerAppointment.externalRoomId
        ? { externalRoomId: providerAppointment.externalRoomId }
        : {}),
    });
    await createExternalEntityMapping({
      tenantId: input.tenantId,
      localEntityType: 'appointment',
      localEntityId: localAppointment.id,
      externalProvider: scheduling.providerName,
      externalEntityType: 'appointment',
      externalEntityId: providerAppointment.id,
      integrationId: scheduling.integrationId,
      metadata:
        scheduling.providerName === 'google_calendar'
          ? { legacyExternalCalendarEventId: providerAppointment.id }
          : providerMetadata,
    });
  } catch (error) {
    await markAppointmentReconciliationNeeded({
      tenantId: input.tenantId,
      appointmentId: localAppointment.id,
      externalCalendarEventId: providerAppointment.id,
      externalProvider: scheduling.providerName,
      externalAppointmentId: providerAppointment.id,
      reason: error instanceof Error ? error.message : 'Unknown local confirmation failure',
    });
    throw error;
  }

  return {
    eventId: providerAppointment.id,
    htmlLink: providerAppointment.htmlLink,
    slot: providerAppointment.slot,
    appointmentId: localAppointment.id,
  };
}

export async function bookPublicAppointment(
  input: PublicAppointmentBookingInput,
): Promise<LedgerBackedBookingResult> {
  const clinic = await configService.getClinicProfile(input.tenantId);
  const rules = await configService.getBookingRules(input.tenantId);

  if (!clinic?.timezone) {
    throw new ValidationError('Clinic timezone is required to book appointments');
  }

  assertPublicBookingRules({
    slot: input.slot,
    patient: input.patient,
    timezone: clinic.timezone,
    maxAdvanceBookingDays: rules?.maxAdvanceBookingDays ?? 30,
  });

  return await bookLedgerBackedAppointment({
    tenantId: input.tenantId,
    idempotencyKey: input.idempotencyKey,
    slot: input.slot,
    summary: `Dental appointment - ${input.patient.fullName}`,
    source: 'appointments.book',
    patient: input.patient,
  });
}

export async function cancelAppointmentFromRoute(input: {
  tenantId: string;
  eventId: string;
}): Promise<{ success: true; appointmentId?: string; message?: string }> {
  if (features.aiAppointmentChangesRequireReview) {
    const appointment = await getAppointmentByExternalCalendarEventId(
      input.tenantId,
      input.eventId,
    );
    if (!appointment) throw new ValidationError('Appointment not found');
    await createAppointmentChangeReviewItem({
      tenantId: input.tenantId,
      action: 'cancel',
      appointment,
      verificationMethod: 'unknown',
    });
    return { success: true, message: CANCEL_REVIEW_MESSAGE };
  }

  return await cancelLedgerBackedAppointment(input);
}

export async function cancelLedgerBackedAppointment(input: {
  tenantId: string;
  eventId: string;
}): Promise<{ success: true; appointmentId: string }> {
  const appointment = await beginAppointmentCancellationByExternalEventId({
    tenantId: input.tenantId,
    externalCalendarEventId: input.eventId,
  });
  const scheduling = await resolveActiveSchedulingProvider({
    tenantId: input.tenantId,
    operation: 'write',
  });

  try {
    await scheduling.provider.cancelAppointment(input.eventId);
    await markAppointmentExternalSyncState({
      tenantId: input.tenantId,
      appointmentId: appointment.id,
      operation: 'cancel',
      status: 'external_cancel_synced',
    });
  } catch (error) {
    await markAppointmentExternalSyncState({
      tenantId: input.tenantId,
      appointmentId: appointment.id,
      operation: 'cancel',
      status: 'local_cancelled_external_cancel_failed',
      reason: error instanceof Error ? error.message : 'Unknown external cancellation failure',
    });
    throw error;
  }

  return { success: true, appointmentId: appointment.id };
}

export async function rescheduleAppointmentFromRoute(input: {
  tenantId: string;
  eventId: string;
  slot: { startIso: string; endIso: string };
}): Promise<{
  success: true;
  appointmentId?: string;
  slot?: { startIso: string; endIso: string };
  message?: string;
}> {
  const clinic = await configService.getClinicProfile(input.tenantId);
  if (!clinic?.timezone) {
    throw new ValidationError('Clinic timezone is required to reschedule appointments');
  }

  if (features.aiAppointmentChangesRequireReview) {
    const appointment = await getAppointmentByExternalCalendarEventId(
      input.tenantId,
      input.eventId,
    );
    if (!appointment) throw new ValidationError('Appointment not found');
    await createAppointmentChangeReviewItem({
      tenantId: input.tenantId,
      action: 'reschedule',
      appointment,
      verificationMethod: 'unknown',
      requestedStartAt: input.slot.startIso,
      requestedEndAt: input.slot.endIso,
    });
    return { success: true, message: RESCHEDULE_REVIEW_MESSAGE };
  }

  return await rescheduleLedgerBackedAppointment({
    tenantId: input.tenantId,
    eventId: input.eventId,
    timezone: clinic.timezone,
    slot: input.slot,
  });
}

export async function rescheduleLedgerBackedAppointment(input: {
  tenantId: string;
  eventId: string;
  timezone: string;
  slot: { startIso: string; endIso: string };
}): Promise<{ success: true; appointmentId: string; slot: { startIso: string; endIso: string } }> {
  const { startAt, endAt } = parseSlot(input.slot);
  const appointment = await beginAppointmentRescheduleByExternalEventId({
    tenantId: input.tenantId,
    externalCalendarEventId: input.eventId,
    startAt,
    endAt,
    timezone: input.timezone,
  });
  const scheduling = await resolveActiveSchedulingProvider({
    tenantId: input.tenantId,
    operation: 'write',
  });

  try {
    await scheduling.provider.rescheduleAppointment(input.eventId, {
      tenantId: input.tenantId,
      appAppointmentId: appointment.id,
      timezone: input.timezone,
      slot: input.slot,
    });
    await markAppointmentExternalSyncState({
      tenantId: input.tenantId,
      appointmentId: appointment.id,
      operation: 'reschedule',
      status: 'external_reschedule_synced',
    });
  } catch (error) {
    await markAppointmentExternalSyncState({
      tenantId: input.tenantId,
      appointmentId: appointment.id,
      operation: 'reschedule',
      status: 'local_rescheduled_external_reschedule_failed',
      reason: error instanceof Error ? error.message : 'Unknown external reschedule failure',
    });
    throw error;
  }

  return { success: true, appointmentId: appointment.id, slot: input.slot };
}
