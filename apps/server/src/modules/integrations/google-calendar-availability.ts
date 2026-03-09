import { IntegrationError, ValidationError } from '../../lib/errors.js';
import { getActiveGoogleCalendarIntegration } from './integration-registry.js';
import {
  formatLocalDate,
  formatSlotLabel,
  getDayKey,
  getFormatterParts,
  makeDateInTimeZone,
  parseTimeString,
  resolveValidGoogleAccessToken,
} from './google-calendar.shared.js';
import type {
  CalendarAvailabilityInput,
  CalendarSlot,
  Integration,
} from './integration.types.js';

function normalizeClosedDates(closedDates?: string[] | null): Set<string> {
  return new Set((closedDates ?? []).map((value) => value.trim()).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)));
}

function normalizeScheduleEntry(schedule: Record<string, unknown> | null | undefined, dayKey: string): { start: string; end: string; breaks: Array<{ start: string; end: string }> } | null {
  if (!schedule || typeof schedule !== 'object') return null;
  const rawEntry = schedule[dayKey];
  if (!rawEntry || typeof rawEntry !== 'object') return null;
  const entry = rawEntry as {
    start?: unknown;
    end?: unknown;
    breakStart?: unknown;
    breakEnd?: unknown;
    breaks?: Array<{ start?: unknown; end?: unknown }> | unknown;
  };
  if (typeof entry.start !== 'string' || typeof entry.end !== 'string' || !entry.start.trim() || !entry.end.trim()) return null;

  const normalizedBreaks = Array.isArray(entry.breaks)
    ? entry.breaks
      .filter((item): item is { start?: unknown; end?: unknown } => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        start: typeof item.start === 'string' ? item.start.trim() : '',
        end: typeof item.end === 'string' ? item.end.trim() : '',
      }))
      .filter((item) => item.start && item.end)
    : [];

  if (
    normalizedBreaks.length === 0
    && typeof entry.breakStart === 'string'
    && typeof entry.breakEnd === 'string'
    && entry.breakStart.trim()
    && entry.breakEnd.trim()
  ) {
    normalizedBreaks.push({ start: entry.breakStart.trim(), end: entry.breakEnd.trim() });
  }

  return { start: entry.start, end: entry.end, breaks: normalizedBreaks };
}

function slotMatchesRequestedPeriod(date: Date, timezone: string, period?: 'morning' | 'afternoon' | 'evening' | null): boolean {
  if (!period) return true;
  const hour = Number(getFormatterParts(date, timezone).hour);
  if (period === 'morning') return hour >= 8 && hour < 12;
  if (period === 'afternoon') return hour >= 12 && hour < 17;
  return hour >= 17 || hour < 8;
}

function overlapsRange(startMs: number, endMs: number, busyIntervals: Array<{ startMs: number; endMs: number }>): boolean {
  return busyIntervals.some((busy) => startMs < busy.endMs && endMs > busy.startMs);
}

function normalizeRequestedDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ValidationError('Requested booking date must use YYYY-MM-DD format');
  }
  return trimmed;
}

async function fetchGoogleCalendarBusyIntervals(
  integration: Integration,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<Array<{ startMs: number; endMs: number }>> {
  const { accessToken } = await resolveValidGoogleAccessToken(integration);
  const config = (integration.config ?? {}) as Record<string, unknown>;
  const calendarId = typeof config.calendarId === 'string' && config.calendarId.trim() ? config.calendarId : 'primary';

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', timeMinIso);
  url.searchParams.set('timeMax', timeMaxIso);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new IntegrationError('calendar', 'google_calendar', 'Failed to load Google Calendar events');
  }

  const payload = (await response.json()) as {
    items?: Array<{
      status?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  return (payload.items ?? [])
    .filter((item) => item.status !== 'cancelled')
    .map((item) => {
      const startValue = item.start?.dateTime ?? item.start?.date;
      const endValue = item.end?.dateTime ?? item.end?.date;
      if (!startValue || !endValue) return null;
      const startMs = new Date(startValue).getTime();
      const endMs = new Date(endValue).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
      return { startMs, endMs };
    })
    .filter((item): item is { startMs: number; endMs: number } => Boolean(item));
}

export async function findAvailableCalendarSlots(input: CalendarAvailabilityInput): Promise<{
  requestedDate: string;
  exactMatch: CalendarSlot | null;
  suggestedSlots: CalendarSlot[];
}> {
  const integration = await getActiveGoogleCalendarIntegration(input.tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }

  const requestedDate = normalizeRequestedDate(input.requestedDate);
  const durationMinutes = Math.max(5, input.appointmentDurationMinutes || 30);
  const bufferMinutes = Math.max(0, input.bufferBetweenAppointmentsMinutes || 0);
  const slotStepMinutes = durationMinutes + bufferMinutes;
  const maxSlots = Math.max(1, input.maxSlots || 3);
  const lookAheadDays = Math.max(1, input.lookAheadDays || 7);
  const closedDates = normalizeClosedDates(input.closedDates);
  const requestedTime = parseTimeString(input.requestedTime);

  const [year, month, day] = requestedDate.split('-').map(Number);
  const rangeStart = makeDateInTimeZone(input.timezone, year, month, day, 0, 0);
  const rangeEnd = new Date(rangeStart.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);
  const busyIntervals = await fetchGoogleCalendarBusyIntervals(integration, rangeStart.toISOString(), rangeEnd.toISOString());

  const suggestedSlots: CalendarSlot[] = [];
  let exactMatch: CalendarSlot | null = null;

  for (let offsetDays = 0; offsetDays < lookAheadDays && suggestedSlots.length < maxSlots; offsetDays += 1) {
    const candidateDay = new Date(rangeStart.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const candidateDate = formatLocalDate(candidateDay, input.timezone);
    if (closedDates.has(candidateDate)) continue;

    const schedule = normalizeScheduleEntry(input.operatingSchedule, getDayKey(candidateDay, input.timezone));
    if (!schedule) continue;

    const startTime = parseTimeString(schedule.start);
    const endTime = parseTimeString(schedule.end);
    if (!startTime || !endTime) continue;

    const openAt = makeDateInTimeZone(input.timezone, Number(candidateDate.slice(0, 4)), Number(candidateDate.slice(5, 7)), Number(candidateDate.slice(8, 10)), startTime.hour, startTime.minute);
    const closeAt = makeDateInTimeZone(input.timezone, Number(candidateDate.slice(0, 4)), Number(candidateDate.slice(5, 7)), Number(candidateDate.slice(8, 10)), endTime.hour, endTime.minute);
    const breakIntervals = schedule.breaks
      .map((period) => {
        const breakStart = parseTimeString(period.start);
        const breakEnd = parseTimeString(period.end);
        if (!breakStart || !breakEnd) return null;

        return {
          startMs: makeDateInTimeZone(input.timezone, Number(candidateDate.slice(0, 4)), Number(candidateDate.slice(5, 7)), Number(candidateDate.slice(8, 10)), breakStart.hour, breakStart.minute).getTime(),
          endMs: makeDateInTimeZone(input.timezone, Number(candidateDate.slice(0, 4)), Number(candidateDate.slice(5, 7)), Number(candidateDate.slice(8, 10)), breakEnd.hour, breakEnd.minute).getTime(),
        };
      })
      .filter((interval): interval is { startMs: number; endMs: number } => Boolean(interval && interval.startMs < interval.endMs));

    for (
      let slotStart = new Date(openAt);
      slotStart.getTime() + durationMinutes * 60_000 <= closeAt.getTime();
      slotStart = new Date(slotStart.getTime() + slotStepMinutes * 60_000)
    ) {
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
      const occupancyEnd = new Date(slotEnd.getTime() + bufferMinutes * 60_000);
      if (overlapsRange(slotStart.getTime(), slotEnd.getTime(), breakIntervals)) continue;
      if (overlapsRange(slotStart.getTime(), occupancyEnd.getTime(), busyIntervals)) continue;
      if (!slotMatchesRequestedPeriod(slotStart, input.timezone, input.requestedPeriod)) continue;

      const slot: CalendarSlot = {
        startIso: slotStart.toISOString(),
        endIso: slotEnd.toISOString(),
        label: formatSlotLabel(slotStart.toISOString(), input.timezone),
      };

      if (
        requestedTime
        && candidateDate === requestedDate
        && Number(getFormatterParts(slotStart, input.timezone).hour) === requestedTime.hour
        && Number(getFormatterParts(slotStart, input.timezone).minute) === requestedTime.minute
      ) {
        exactMatch = slot;
        if (suggestedSlots.length === 0) suggestedSlots.push(slot);
        break;
      }

      suggestedSlots.push(slot);
      if (suggestedSlots.length >= maxSlots) break;
    }

    if (exactMatch) break;
  }

  return { requestedDate, exactMatch, suggestedSlots };
}
