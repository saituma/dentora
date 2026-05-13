import { hashForSearch } from '../../lib/encrypted-column.js';
import { ValidationError } from '../../lib/errors.js';
import * as configService from '../config/config.service.js';
import {
  cancelGoogleCalendarAppointment,
  createGoogleCalendarAppointment,
  findAvailableCalendarSlots,
  getActiveGoogleCalendarIntegration,
  rescheduleGoogleCalendarAppointment,
  type CalendarSlot,
} from '../integrations/integration.service.js';
import { upsertPatientProfile } from '../patients/patients.service.js';
import {
  attachExternalCalendarEvent,
  beginAppointmentCancellationByExternalEventId,
  beginAppointmentRescheduleByExternalEventId,
  confirmAppointmentHold,
  createAppointmentHold,
  markAppointmentExternalSyncState,
  markAppointmentReconciliationNeeded,
} from './appointment-ledger.service.js';

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
}

export interface LedgerBackedBookingResult {
  eventId: string;
  htmlLink?: string;
  slot: CalendarSlot;
  appointmentId: string;
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

  const integration = await getActiveGoogleCalendarIntegration(input.tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }

  const recheckedAvailability = await findAvailableCalendarSlots({
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

  const exactSlot = recheckedAvailability.exactMatch;
  if (
    !exactSlot ||
    exactSlot.startIso !== input.slot.startIso ||
    exactSlot.endIso !== input.slot.endIso
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
    calendarIntegrationId: integration.id,
    idempotencyKey: `${baseIdempotencyKey}:hold`,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    metadata: { source: 'ai.telephony.book' },
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

  const calendarAppointment = await createGoogleCalendarAppointment({
    tenantId: input.tenantId,
    timezone: clinic.timezone,
    slot: input.slot,
    summary: input.summary ?? `Dental appointment - ${input.patient.fullName}`,
    patient: input.patient,
  });

  try {
    await attachExternalCalendarEvent({
      tenantId: input.tenantId,
      appointmentId: localAppointment.id,
      externalCalendarEventId: calendarAppointment.eventId,
    });
  } catch (error) {
    await markAppointmentReconciliationNeeded({
      tenantId: input.tenantId,
      appointmentId: localAppointment.id,
      externalCalendarEventId: calendarAppointment.eventId,
      reason: error instanceof Error ? error.message : 'Unknown local confirmation failure',
    });
    throw error;
  }

  return {
    ...calendarAppointment,
    appointmentId: localAppointment.id,
  };
}

export async function cancelLedgerBackedAppointment(input: {
  tenantId: string;
  eventId: string;
}): Promise<{ success: true; appointmentId: string }> {
  const appointment = await beginAppointmentCancellationByExternalEventId({
    tenantId: input.tenantId,
    externalCalendarEventId: input.eventId,
  });

  try {
    await cancelGoogleCalendarAppointment({ tenantId: input.tenantId, eventId: input.eventId });
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

  try {
    await rescheduleGoogleCalendarAppointment({
      tenantId: input.tenantId,
      eventId: input.eventId,
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
