import type { AppointmentChangeMode } from './receptionist-booking.types.js';

const BOOKING_KEYWORDS = /\b(book|booking|schedule|appointment|available|availability|come in|see the dentist|reserve)\b/i;
const CANCEL_KEYWORDS = /\b(cancel|cancellation|call off|remove)\b/i;
const RESCHEDULE_KEYWORDS = /\b(reschedule|rescheduling|move|change)\b/i;
const GREETING_PATTERNS = [/\bhi\b/i, /\bhello\b/i, /\bhey\b/i, /\bgood morning\b/i, /\bgood afternoon\b/i, /\bgood evening\b/i];
const SMALL_TALK_PATTERNS = [/\bhow are you\b/i, /\bhow are you doing\b/i, /\bhow s it going\b/i, /\bthanks\b/i, /\bthank you\b/i];
const AFFIRMATIVE_PATTERNS = [/\byes\b/i, /\byeah\b/i, /\byep\b/i, /\bplease do\b/i, /\bconfirm\b/i, /\bgo ahead\b/i, /\bcorrect\b/i];
const NEGATIVE_PATTERNS = [/\bno\b/i, /\bnot yet\b/i, /\bwait\b/i, /\bwrong\b/i, /\bdon t\b/i, /\bdo not\b/i];
const BOOKING_CONFIRMATION_PATTERNS = [/\byes\b/i, /\bbook it\b/i, /\bbukit\b/i, /\bgo ahead\b/i, /\bconfirm\b/i, /\bthat works\b/i, /\bsounds good\b/i, /\bplease book\b/i, /\bi agree\b/i, /\bi agreed\b/i];
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export function normalizeMessage(value: string): string {
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getTodayDateString(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysToDateString(date: string, daysToAdd: number): string {
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + daysToAdd);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

export function resolveRequestedDateFromMessage(message: string, timezone: string): string | undefined {
  const normalized = normalizeMessage(message);
  if (!normalized) return undefined;

  const today = getTodayDateString(timezone);
  if (/\btoday\b/.test(normalized)) return today;
  if (/\btomorrow\b/.test(normalized)) return addDaysToDateString(today, 1);

  const todayDayKey = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(new Date()).toLowerCase() as typeof WEEKDAY_KEYS[number];
  const todayIndex = WEEKDAY_KEYS.indexOf(todayDayKey);
  if (todayIndex === -1) return undefined;

  for (const dayKey of WEEKDAY_KEYS) {
    if (!new RegExp(`\\b${dayKey}\\b`, 'i').test(normalized)) continue;
    const requestedIndex = WEEKDAY_KEYS.indexOf(dayKey);
    let daysAhead = (requestedIndex - todayIndex + 7) % 7;
    if (daysAhead === 0 && new RegExp(`\\bnext\\s+${dayKey}\\b`, 'i').test(normalized)) daysAhead = 7;
    return addDaysToDateString(today, daysAhead);
  }

  return undefined;
}

export function messageLooksBookingRelated(message: string): boolean {
  const normalized = normalizeMessage(message);
  return Boolean(normalized) && (
    BOOKING_KEYWORDS.test(normalized)
    || /\bdoctor\b/.test(normalized)
    || /\bdentist\b/.test(normalized)
    || /\bcheckup\b/.test(normalized)
    || /\bcleaning\b/.test(normalized)
    || /\btoothache\b/.test(normalized)
    || /\bpain\b/.test(normalized)
    || /\bemergency\b/.test(normalized)
  );
}

export function detectAppointmentChangeMode(message: string): AppointmentChangeMode | null {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;
  if (CANCEL_KEYWORDS.test(normalized)) return 'cancel';
  if (RESCHEDULE_KEYWORDS.test(normalized)) return 'reschedule';
  return null;
}

export function hasUsefulAppointmentDetails(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) return false;

  return [
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b/i,
    /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/i,
    /\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/i,
    /\bmy name is\b/i,
    /\bpatient\b/i,
    /\bappointment\b/i,
  ].some((pattern) => pattern.test(normalized));
}

export function isAffirmativeMessage(message: string): boolean {
  return AFFIRMATIVE_PATTERNS.some((pattern) => pattern.test(normalizeMessage(message)));
}

export function isNegativeMessage(message: string): boolean {
  return NEGATIVE_PATTERNS.some((pattern) => pattern.test(normalizeMessage(message)));
}

export function isBookingConfirmationMessage(message: string): boolean {
  const normalized = normalizeMessage(message);
  return Boolean(normalized) && BOOKING_CONFIRMATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildDirectResponseTokens() {
  return { GREETING_PATTERNS, SMALL_TALK_PATTERNS };
}

export function formatTodayForPrompt(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).format(new Date());
}

export function normalizeJsonBlock(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found');
  }
  return raw.slice(start, end + 1);
}

export function isRawBookingIntent(message: string): boolean {
  return BOOKING_KEYWORDS.test(message);
}
