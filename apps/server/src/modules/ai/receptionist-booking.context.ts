import type { CalendarSlot } from '../integrations/integration.service.js';
import type { TenantAIContext } from './ai.service.js';
import type { PatientBookingDetails } from './receptionist-booking.types.js';
import { normalizeMessage } from './receptionist-booking.utils.js';

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

type StaffEntry = {
  name: string;
  role?: string;
  phone?: string;
  status?: 'available' | 'unavailable';
  /** From clinic profile; false means do not assign new appointments to this provider. */
  acceptsAppointments?: boolean;
};

function parseStaffFromClinicProfile(clinic: Record<string, unknown>): StaffEntry[] {
  const raw = clinic.staffMembers;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => row as { name?: string; role?: string; acceptsAppointments?: boolean })
    .filter((row) => typeof row.name === 'string' && row.name.trim().length > 0)
    .map((row) => ({
      name: row.name!.trim(),
      role: typeof row.role === 'string' ? row.role.trim() : undefined,
      status: 'available' as const,
      acceptsAppointments: row.acceptsAppointments !== false,
    }));
}

function parseStaffDirectory(context: TenantAIContext): StaffEntry[] {
  const topics = context.policies
    .flatMap((policy) => {
      const rawTopics = (policy as { sensitiveTopics?: unknown }).sensitiveTopics;
      return Array.isArray(rawTopics) ? rawTopics : [];
    })
    .map((topic) => topic as { type?: string; title?: string; content?: string })
    .filter((topic) => topic.type === 'context_document' && typeof topic.content === 'string' && topic.content.trim())
    .filter((topic) => (topic.title ?? '').toLowerCase().includes('staff'));

  const entries: StaffEntry[] = [];
  for (const topic of topics) {
    const lines = topic.content!.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/[-•|]/).map((part) => part.trim()).filter(Boolean);
      const phone = line.replace(/\D/g, '').trim();
      const status = /\b(unavailable|off|away|out)\b/i.test(line)
        ? 'unavailable'
        : /\b(available|on|in)\b/i.test(line)
          ? 'available'
          : undefined;

      const name = parts[0] ?? line;
      const role = parts.length > 1 ? parts[1] : undefined;
      entries.push({
        name,
        role,
        phone: phone.length >= 7 ? phone : undefined,
        status,
      });
    }
  }

  return entries;
}

export function findStaffMember(context: TenantAIContext, message: string): StaffEntry | null {
  const fromClinic = parseStaffFromClinicProfile(context.clinic);
  const fromDocs = parseStaffDirectory(context);
  const staff = fromClinic.length > 0 ? fromClinic : fromDocs;
  if (staff.length === 0) return null;

  const normalized = normalizeMessage(message);
  const explicitMatch = staff.find((entry) => {
    const nameKey = normalizeMessage(entry.name);
    return nameKey && normalized.includes(nameKey);
  });
  if (explicitMatch) return explicitMatch;

  const bookableFirst = staff.filter((entry) => entry.acceptsAppointments !== false);
  const pool = bookableFirst.length > 0 ? bookableFirst : staff;

  const available = pool.find((entry) => entry.status !== 'unavailable');
  return available ?? pool[0];
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
  const incomingName = incoming.fullName?.trim();
  const nameChanged = Boolean(incomingName && incomingName !== current.fullName);

  return {
    fullName: incomingName || current.fullName,
    nameConfirmed: nameChanged
      ? undefined
      : (typeof incoming.nameConfirmed === 'boolean' ? incoming.nameConfirmed : current.nameConfirmed),
    namePronunciation: incoming.namePronunciation?.trim() || current.namePronunciation,
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

export function extractPronunciationFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/pronunciation:\s*([^|]+)/i);
  return match ? match[1].trim() : null;
}

export function buildPatientNotes(reasonForVisit?: string, namePronunciation?: string): string | null {
  const parts: string[] = [];
  if (reasonForVisit?.trim()) parts.push(`Reason: ${reasonForVisit.trim()}`);
  if (namePronunciation?.trim()) parts.push(`Pronunciation: ${namePronunciation.trim()}`);
  return parts.length > 0 ? parts.join(' | ') : null;
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
