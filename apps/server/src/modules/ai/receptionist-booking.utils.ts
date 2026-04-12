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
const MONTH_KEYS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

const ORDINAL_DAY_MAP: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  'twenty first': 21,
  'twenty second': 22,
  'twenty third': 23,
  'twenty fourth': 24,
  'twenty fifth': 25,
  'twenty sixth': 26,
  'twenty seventh': 27,
  'twenty eighth': 28,
  'twenty ninth': 29,
  thirtieth: 30,
  'thirty first': 31,
};

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

function buildDateString(year: number, month: number, day: number, timezone: string): string {
  const seed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(seed);
}

function findMonthDay(normalized: string, timezone: string): string | undefined {
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 0) return undefined;

  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : Number(getTodayDateString(timezone).slice(0, 4));

  for (let i = 0; i < tokens.length; i += 1) {
    const monthIndex = MONTH_KEYS.indexOf(tokens[i] as typeof MONTH_KEYS[number]);
    if (monthIndex === -1) continue;

    const next = tokens[i + 1];
    const nextTwo = next && tokens[i + 2] ? `${next} ${tokens[i + 2]}` : '';
    let day: number | undefined;

    if (next && /^\d{1,2}$/.test(next)) {
      day = Number(next);
    } else if (nextTwo && ORDINAL_DAY_MAP[nextTwo]) {
      day = ORDINAL_DAY_MAP[nextTwo];
    } else if (next && ORDINAL_DAY_MAP[next]) {
      day = ORDINAL_DAY_MAP[next];
    }

    if (day && day >= 1 && day <= 31) {
      return buildDateString(year, monthIndex + 1, day, timezone);
    }
  }

  return undefined;
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

  const monthDay = findMonthDay(normalized, timezone);
  if (monthDay) return monthDay;

  return undefined;
}

export function normalizeImplicitYearDate(dateString: string, message: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;

  const normalizedMessage = normalizeMessage(message);
  const hasExplicitYear = /\b20\d{2}\b/.test(normalizedMessage);
  if (hasExplicitYear) return dateString;

  const today = getTodayDateString(timezone);
  const currentYear = Number(today.slice(0, 4));
  const month = Number(dateString.slice(5, 7));
  const day = Number(dateString.slice(8, 10));

  let candidate = buildDateString(currentYear, month, day, timezone);
  if (candidate < today) {
    candidate = buildDateString(currentYear + 1, month, day, timezone);
  }
  return candidate;
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
  if (
    /\b(check|confirm|verify|review)\b/.test(normalized)
    && /\bappointment(s)?\b/.test(normalized)
  ) {
    return 'check';
  }
  if (/\b(when|what time)\b/.test(normalized) && /\bappointment(s)?\b/.test(normalized)) {
    return 'check';
  }
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
