import type { CalendarSlot } from '../integrations/integration.service.js';
import type { TenantAIContext } from './ai.service.js';
import type { PatientBookingDetails } from './receptionist-booking.types.js';

export function getTimezone(context: TenantAIContext): string {
  const clinic = context.clinic as { timezone?: string };
  return clinic.timezone ?? 'America/New_York';
}

export function getOperatingSchedule(context: TenantAIContext): Record<string, unknown> | null {
  const clinic = context.clinic as { businessHours?: Record<string, unknown> };
  const booking = context.bookingRules as { operatingSchedule?: Record<string, unknown> };
  return booking.operatingSchedule ?? clinic.businessHours ?? null;
}

export function getClosedDates(context: TenantAIContext): string[] {
  const booking = context.bookingRules as { closedDates?: unknown };
  return Array.isArray(booking.closedDates)
    ? booking.closedDates.filter((value): value is string => typeof value === 'string')
    : [];
}

export function getAppointmentDuration(context: TenantAIContext): number {
  const booking = context.bookingRules as { defaultAppointmentDurationMinutes?: number };
  return booking.defaultAppointmentDurationMinutes ?? 30;
}

export function getBufferMinutes(context: TenantAIContext): number {
  const booking = context.bookingRules as { bufferBetweenAppointmentsMinutes?: number };
  return booking.bufferBetweenAppointmentsMinutes ?? 0;
}

export function clinicName(context: TenantAIContext): string {
  return context.clinicName || 'the clinic';
}

export function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getDayKeyForDate(date: string, timezone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const localDate = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(localDate).toLowerCase();
}

export function isClinicOpenOnDate(
  schedule: Record<string, unknown> | null,
  closedDates: string[],
  requestedDate: string,
  timezone: string,
): boolean {
  if (closedDates.includes(requestedDate) || !schedule || typeof schedule !== 'object') return false;
  const dayKey = getDayKeyForDate(requestedDate, timezone);
  if (!dayKey) return false;
  const rawEntry = schedule[dayKey];
  if (!rawEntry || typeof rawEntry !== 'object') return false;
  const entry = rawEntry as { start?: unknown; end?: unknown };
  return typeof entry.start === 'string' && !!entry.start.trim() && typeof entry.end === 'string' && !!entry.end.trim();
}

export function mergePatientDetails(current: PatientBookingDetails, incoming: PatientBookingDetails): PatientBookingDetails {
  return {
    fullName: incoming.fullName?.trim() || current.fullName,
    age: typeof incoming.age === 'number' ? incoming.age : current.age,
    phoneNumber: incoming.phoneNumber?.trim() || current.phoneNumber,
    reasonForVisit: incoming.reasonForVisit?.trim() || current.reasonForVisit,
  };
}

export function getMissingPatientField(patient: PatientBookingDetails): keyof PatientBookingDetails | null {
  if (!patient.fullName) return 'fullName';
  if (typeof patient.age !== 'number') return 'age';
  if (!patient.phoneNumber) return 'phoneNumber';
  if (!patient.reasonForVisit) return 'reasonForVisit';
  return null;
}

export function buildPatientQuestion(field: keyof PatientBookingDetails): string {
  if (field === 'fullName') return 'Before I lock that in, may I have the patient’s full name?';
  if (field === 'age') return 'Thanks. What is the patient’s age?';
  if (field === 'phoneNumber') return 'What is the best phone number for the appointment?';
  return 'What is the main reason for the visit today?';
}

export function formatFullSlotDate(startIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(startIso));
}

export function formatSlotTime(startIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startIso));
}

function joinWithOr(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

export function buildSlotOptionsText(slots: CalendarSlot[], timezone: string): string {
  const topSlots = slots.slice(0, 3);
  if (topSlots.length === 0) return '';

  const sameDate = topSlots.every(
    (slot) => formatDateInTimezone(new Date(slot.startIso), timezone) === formatDateInTimezone(new Date(topSlots[0].startIso), timezone),
  );

  if (sameDate) {
    const dateLabel = formatFullSlotDate(topSlots[0].startIso, timezone);
    const timeLabels = topSlots.map((slot) => formatSlotTime(slot.startIso, timezone));
    return `I have openings on ${dateLabel} at ${joinWithOr(timeLabels)}.`;
  }

  const optionLabels = topSlots.map((slot) => `${formatFullSlotDate(slot.startIso, timezone)} at ${formatSlotTime(slot.startIso, timezone)}`);
  return `I have openings on ${joinWithOr(optionLabels)}.`;
}
