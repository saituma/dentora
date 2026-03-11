import { IntegrationError, ValidationError } from '../../lib/errors.js';
import { getActiveGoogleCalendarIntegration } from './integration-registry.js';
import {
  formatSlotLabel,
  getFormatterParts,
  makeDateInTimeZone,
  parseTimeString,
  resolveValidGoogleAccessToken,
} from './google-calendar.shared.js';
import type {
  CalendarAppointmentMatch,
  CalendarSlot,
  CreateCalendarAppointmentInput,
  FindCalendarAppointmentInput,
} from './integration.types.js';

function getCalendarId(config: Record<string, unknown>): string {
  return typeof config.calendarId === 'string' && config.calendarId.trim()
    ? config.calendarId
    : 'primary';
}

export async function createGoogleCalendarAppointment(input: CreateCalendarAppointmentInput): Promise<{ eventId: string; htmlLink?: string; slot: CalendarSlot }> {
  const integration = await getActiveGoogleCalendarIntegration(input.tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }

  const { accessToken } = await resolveValidGoogleAccessToken(integration);
  const calendarId = getCalendarId((integration.config ?? {}) as Record<string, unknown>);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.summary,
        description: [
          `Patient name: ${input.patient.fullName}`,
          input.patient.age != null ? `Age: ${input.patient.age}` : null,
          `Phone: ${input.patient.phoneNumber}`,
          `Reason for visit: ${input.patient.reasonForVisit}`,
        ].filter(Boolean).join('\n'),
        start: {
          dateTime: input.slot.startIso,
          timeZone: input.timezone,
        },
        end: {
          dateTime: input.slot.endIso,
          timeZone: input.timezone,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new IntegrationError('calendar', 'google_calendar', `Failed to create Google Calendar event: ${errorBody.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { id?: string; htmlLink?: string };
  return {
    eventId: payload.id ?? 'unknown',
    htmlLink: payload.htmlLink,
    slot: {
      startIso: input.slot.startIso,
      endIso: input.slot.endIso,
      label: formatSlotLabel(input.slot.startIso, input.timezone),
    },
  };
}

export async function findGoogleCalendarAppointment(input: FindCalendarAppointmentInput): Promise<CalendarAppointmentMatch | null> {
  const integration = await getActiveGoogleCalendarIntegration(input.tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }

  const phoneKey = input.phoneNumber ? input.phoneNumber.replace(/\D/g, '') : '';
  const patientKey = input.patientName?.trim().toLowerCase() ?? '';
  if (!phoneKey && !patientKey) {
    return null;
  }

  const { accessToken } = await resolveValidGoogleAccessToken(integration);
  const calendarId = getCalendarId((integration.config ?? {}) as Record<string, unknown>);
  const [year, month, day] = input.appointmentDate.split('-').map(Number);
  if (!year || !month || !day) {
    throw new ValidationError('Invalid appointment date. Expected YYYY-MM-DD.');
  }

  const rangeStart = makeDateInTimeZone(input.timezone, year, month, day, 0, 0);
  const rangeEnd = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', rangeStart.toISOString());
  url.searchParams.set('timeMax', rangeEnd.toISOString());
  if (phoneKey) {
    url.searchParams.set('q', phoneKey);
  } else if (patientKey) {
    url.searchParams.set('q', input.patientName ?? '');
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new IntegrationError('calendar', 'google_calendar', 'Failed to search Google Calendar events');
  }

  const payload = (await response.json()) as {
    items?: Array<{
      id?: string;
      status?: string;
      summary?: string;
      description?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  const requestedTime = parseTimeString(input.appointmentTime ?? null);
  const candidates = (payload.items ?? [])
    .filter((item) => item.status !== 'cancelled' && item.id)
    .map((item) => {
      const startIso = item.start?.dateTime ?? item.start?.date;
      const endIso = item.end?.dateTime ?? item.end?.date;
      if (!startIso || !endIso) return null;

      const haystack = `${item.summary ?? ''} ${item.description ?? ''}`;
      const haystackLower = haystack.toLowerCase();
      const haystackDigits = haystack.replace(/\D/g, '');
      if (phoneKey && !haystackDigits.includes(phoneKey)) return null;
      if (patientKey && !haystackLower.includes(patientKey)) return null;

      const startDate = new Date(startIso);
      const startParts = getFormatterParts(startDate, input.timezone);
      const score = requestedTime
        ? Math.abs((Number(startParts.hour) * 60 + Number(startParts.minute)) - (requestedTime.hour * 60 + requestedTime.minute))
        : 0;

      return {
        eventId: item.id!,
        summary: item.summary ?? 'Dental appointment',
        startIso,
        endIso,
        label: formatSlotLabel(startIso, input.timezone),
        score,
      };
    })
    .filter((item): item is {
      eventId: string;
      summary: string;
      startIso: string;
      endIso: string;
      label: string;
      score: number;
    } => Boolean(item))
    .sort((left, right) => left.score - right.score);

  if (candidates.length === 0) return null;
  const best = candidates[0];
  return {
    eventId: best.eventId,
    summary: best.summary,
    startIso: best.startIso,
    endIso: best.endIso,
    label: best.label,
  };
}

export async function cancelGoogleCalendarAppointment(input: { tenantId: string; eventId: string }): Promise<void> {
  const integration = await getActiveGoogleCalendarIntegration(input.tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }

  const { accessToken } = await resolveValidGoogleAccessToken(integration);
  const calendarId = getCalendarId((integration.config ?? {}) as Record<string, unknown>);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text();
    throw new IntegrationError('calendar', 'google_calendar', `Failed to cancel Google Calendar event: ${errorBody.slice(0, 500)}`);
  }
}

export async function rescheduleGoogleCalendarAppointment(input: {
  tenantId: string;
  timezone: string;
  eventId: string;
  slot: { startIso: string; endIso: string };
}): Promise<void> {
  const integration = await getActiveGoogleCalendarIntegration(input.tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }

  const { accessToken } = await resolveValidGoogleAccessToken(integration);
  const calendarId = getCalendarId((integration.config ?? {}) as Record<string, unknown>);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start: { dateTime: input.slot.startIso, timeZone: input.timezone },
        end: { dateTime: input.slot.endIso, timeZone: input.timezone },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new IntegrationError('calendar', 'google_calendar', `Failed to reschedule Google Calendar event: ${errorBody.slice(0, 500)}`);
  }
}
