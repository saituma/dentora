
import { db } from '../../db/index.js';
import { integrations } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { generateId } from '../../lib/crypto.js';
import { cache, getRedis, globalKey } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError, IntegrationError, ValidationError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { encrypt, decrypt } from '../../lib/encryption.js';
import type { InferSelectModel } from 'drizzle-orm';

type Integration = InferSelectModel<typeof integrations>;

const GOOGLE_OAUTH_STATE_DOMAIN = 'google-calendar-oauth';
const GOOGLE_OAUTH_STATE_TTL_SECONDS = 600;
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

interface GoogleOAuthStatePayload {
  tenantId: string;
  accountEmail?: string;
  calendarId?: string;
  returnTo?: string;
  createdAt: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleCalendarIdentity {
  accountEmail?: string;
  calendarId?: string;
}

export interface CalendarSlot {
  startIso: string;
  endIso: string;
  label: string;
}

export interface CalendarAvailabilityInput {
  tenantId: string;
  timezone: string;
  requestedDate: string;
  requestedTime?: string | null;
  requestedPeriod?: 'morning' | 'afternoon' | 'evening' | null;
  appointmentDurationMinutes: number;
  bufferBetweenAppointmentsMinutes?: number;
  operatingSchedule?: Record<string, unknown> | null;
  closedDates?: string[] | null;
  maxSlots?: number;
  lookAheadDays?: number;
}

export interface CreateCalendarAppointmentInput {
  tenantId: string;
  timezone: string;
  slot: {
    startIso: string;
    endIso: string;
  };
  summary: string;
  patient: {
    fullName: string;
    age: number;
    phoneNumber: string;
    reasonForVisit: string;
  };
}

function assertGoogleOAuthConfigured(): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new ValidationError('Google Calendar OAuth is not configured in environment variables');
  }
}

function getAccessTokenExpiry(expiresInSeconds?: number): string | undefined {
  if (!expiresInSeconds || Number.isNaN(expiresInSeconds)) return undefined;
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now() + 60_000;
}

function getFormatterParts(date: Date, timezone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }
  return parts;
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = getFormatterParts(date, timezone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

function makeDateInTimeZone(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const seed = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimeZoneOffsetMs(seed, timezone);
  return new Date(seed.getTime() - offset);
}

function formatLocalDate(date: Date, timezone: string): string {
  const parts = getFormatterParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getDayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(date).toLowerCase();
}

function formatSlotLabel(startIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startIso));
}

function normalizeClosedDates(closedDates?: string[] | null): Set<string> {
  return new Set(
    (closedDates ?? [])
      .map((value) => value.trim())
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  );
}

function normalizeScheduleEntry(
  schedule: Record<string, unknown> | null | undefined,
  dayKey: string,
): { start: string; end: string; breaks: Array<{ start: string; end: string }> } | null {
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
  if (typeof entry.start !== 'string' || typeof entry.end !== 'string') return null;
  if (!entry.start.trim() || !entry.end.trim()) return null;

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
    normalizedBreaks.push({
      start: entry.breakStart.trim(),
      end: entry.breakEnd.trim(),
    });
  }

  return { start: entry.start, end: entry.end, breaks: normalizedBreaks };
}

function parseTimeString(value?: string | null): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function slotMatchesRequestedPeriod(date: Date, timezone: string, period?: 'morning' | 'afternoon' | 'evening' | null): boolean {
  if (!period) return true;
  const hour = Number(getFormatterParts(date, timezone).hour);
  if (period === 'morning') return hour >= 8 && hour < 12;
  if (period === 'afternoon') return hour >= 12 && hour < 17;
  return hour >= 17 || hour < 8;
}

function overlapsRange(
  startMs: number,
  endMs: number,
  busyIntervals: Array<{ startMs: number; endMs: number }>,
): boolean {
  return busyIntervals.some((busy) => startMs < busy.endMs && endMs > busy.startMs);
}

function normalizeRequestedDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ValidationError('Requested booking date must use YYYY-MM-DD format');
  }
  return trimmed;
}

async function exchangeGoogleAuthCode(code: string): Promise<GoogleTokenResponse> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const data = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || data.error || !data.access_token) {
    throw new IntegrationError('calendar', 'google_calendar', data.error_description || data.error || 'Failed to exchange authorization code');
  }
  return data;
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  const data = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || data.error || !data.access_token) {
    throw new IntegrationError('calendar', 'google_calendar', data.error_description || data.error || 'Failed to refresh Google access token');
  }
  return data;
}

async function fetchGoogleCalendarIdentity(accessToken: string): Promise<GoogleCalendarIdentity> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=10', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new IntegrationError('calendar', 'google_calendar', 'Failed to read Google Calendar list');
  }

  const payload = (await response.json()) as {
    items?: Array<{ id?: string; primary?: boolean; accessRole?: string }>;
  };

  const primary = payload.items?.find((item) => item.primary) || payload.items?.[0];
  const primaryId = primary?.id;

  return {
    accountEmail: primaryId,
    calendarId: primaryId || 'primary',
  };
}

async function resolveValidGoogleAccessToken(integration: Integration): Promise<{ accessToken: string; integration: Integration }> {
  const credentials = (integration.credentials ?? {}) as Record<string, unknown>;
  const encryptedAccessToken = typeof credentials.encryptedAccessToken === 'string'
    ? credentials.encryptedAccessToken
    : undefined;
  const encryptedRefreshToken = typeof credentials.encryptedRefreshToken === 'string'
    ? credentials.encryptedRefreshToken
    : undefined;
  const accessTokenExpiresAt = typeof credentials.accessTokenExpiresAt === 'string'
    ? credentials.accessTokenExpiresAt
    : undefined;

  if (!encryptedAccessToken) {
    throw new IntegrationError('calendar', 'google_calendar', 'Missing Google access token');
  }

  if (!isExpired(accessTokenExpiresAt)) {
    return {
      accessToken: decrypt(encryptedAccessToken),
      integration,
    };
  }

  if (!encryptedRefreshToken) {
    throw new IntegrationError('calendar', 'google_calendar', 'Google access token expired and no refresh token is available');
  }

  const refreshed = await refreshGoogleAccessToken(decrypt(encryptedRefreshToken));

  const mergedCredentials = {
    ...credentials,
    encryptedAccessToken: encrypt(refreshed.access_token as string),
    accessTokenExpiresAt: getAccessTokenExpiry(refreshed.expires_in),
    scope: refreshed.scope ?? credentials.scope,
    tokenType: refreshed.token_type ?? credentials.tokenType,
  };

  const [updated] = await db
    .update(integrations)
    .set({
      credentials: mergedCredentials,
      updatedAt: new Date(),
      lastSyncAt: new Date(),
      status: 'active',
    })
    .where(eq(integrations.id, integration.id))
    .returning();

  return {
    accessToken: refreshed.access_token as string,
    integration: updated,
  };
}

export async function startGoogleCalendarOAuth(input: {
  tenantId: string;
  accountEmail?: string;
  calendarId?: string;
  returnTo?: string;
}): Promise<{ authUrl: string; state: string }> {
  assertGoogleOAuthConfigured();

  const state = generateId();
  const payload: GoogleOAuthStatePayload = {
    tenantId: input.tenantId,
    accountEmail: input.accountEmail,
    calendarId: input.calendarId,
    returnTo: input.returnTo,
    createdAt: new Date().toISOString(),
  };

  await cache.setGlobal(
    GOOGLE_OAUTH_STATE_DOMAIN,
    state,
    JSON.stringify(payload),
    GOOGLE_OAUTH_STATE_TTL_SECONDS,
  );

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', env.GOOGLE_OAUTH_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_CALENDAR_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return { authUrl: authUrl.toString(), state };
}

export async function completeGoogleCalendarOAuth(input: {
  state: string;
  code: string;
}): Promise<{ tenantId: string; integrationId: string; returnTo?: string }> {
  assertGoogleOAuthConfigured();

  const stateRaw = await cache.getGlobal(GOOGLE_OAUTH_STATE_DOMAIN, input.state);
  if (!stateRaw) {
    throw new ValidationError('Invalid or expired Google OAuth state');
  }

  await getRedis().del(globalKey(GOOGLE_OAUTH_STATE_DOMAIN, input.state));

  let parsedState: GoogleOAuthStatePayload;
  try {
    parsedState = JSON.parse(stateRaw) as GoogleOAuthStatePayload;
  } catch {
    throw new ValidationError('Corrupted Google OAuth state payload');
  }

  const tokens = await exchangeGoogleAuthCode(input.code);
  const identity = await fetchGoogleCalendarIdentity(tokens.access_token as string);

  const integration = await upsertIntegration({
    tenantId: parsedState.tenantId,
    integrationType: 'calendar',
    provider: 'google_calendar',
    config: {
      calendarId: parsedState.calendarId || identity.calendarId || 'primary',
      accountEmail: parsedState.accountEmail || identity.accountEmail,
      connectedAt: new Date().toISOString(),
    },
    credentials: {
      encryptedAccessToken: encrypt(tokens.access_token as string),
      encryptedRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      accessTokenExpiresAt: getAccessTokenExpiry(tokens.expires_in),
      scope: tokens.scope,
      tokenType: tokens.token_type,
    },
  });

  const activated = await activateIntegration(parsedState.tenantId, integration.id);
  await cache.invalidateTenantDomain(parsedState.tenantId, 'onboarding');

  return {
    tenantId: parsedState.tenantId,
    integrationId: activated.id,
    returnTo: parsedState.returnTo,
  };
}

export async function upsertIntegration(input: {
  tenantId: string;
  integrationType: string;
  provider: string;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}): Promise<Integration> {
  const id = generateId();

  const [existing] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, input.tenantId),
        eq(integrations.integrationType, input.integrationType as any),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
        config: input.config,
        credentials: input.credentials ?? existing.credentials,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, existing.id))
      .returning();

    await cache.invalidateTenantDomain(input.tenantId, 'integrations');
    return updated;
  }

  const [integration] = await db
    .insert(integrations)
    .values({
      id,
      tenantId: input.tenantId,
      configVersion: 1,
      integrationType: input.integrationType as any,
      provider: input.provider ?? 'unknown',
      config: input.config,
      credentials: input.credentials ?? {},
      status: 'disconnected',
    })
    .returning();

  logger.info(
    { tenantId: input.tenantId, type: input.integrationType },
    'Integration created',
  );

  return integration;
}

export async function activateIntegration(tenantId: string, integrationId: string): Promise<Integration> {
  const [updated] = await db
    .update(integrations)
    .set({ status: 'active', lastSyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .returning();

  if (!updated) throw new NotFoundError('Integration not found');

  await cache.invalidateTenantDomain(tenantId, 'integrations');
  return updated;
}

export async function getIntegrations(tenantId: string): Promise<Integration[]> {
  return await db
    .select()
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId));
}

export async function deleteIntegration(tenantId: string, integrationId: string): Promise<void> {
  const result = await db
    .delete(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)));

  await cache.invalidateTenantDomain(tenantId, 'integrations');
  logger.info({ tenantId, integrationId }, 'Integration deleted');
}

export async function testIntegration(tenantId: string, integrationId: string): Promise<{ success: boolean; message: string }> {
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .limit(1);

  if (!integration) throw new NotFoundError('Integration not found');

  if (integration.integrationType === 'calendar' && integration.provider === 'google_calendar') {
    const { accessToken } = await resolveValidGoogleAccessToken(integration);

    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new IntegrationError('calendar', 'google_calendar', 'Google Calendar connectivity test failed');
    }
  }

  return { success: true, message: 'Integration connectivity test passed' };
}

export async function getActiveGoogleCalendarIntegration(tenantId: string): Promise<Integration | null> {
  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, tenantId),
        eq(integrations.integrationType, 'calendar'),
        eq(integrations.provider, 'google_calendar'),
        eq(integrations.status, 'active'),
      ),
    )
    .limit(1);

  return integration ?? null;
}

async function fetchGoogleCalendarBusyIntervals(
  integration: Integration,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<Array<{ startMs: number; endMs: number }>> {
  const { accessToken } = await resolveValidGoogleAccessToken(integration);
  const config = (integration.config ?? {}) as Record<string, unknown>;
  const calendarId = typeof config.calendarId === 'string' && config.calendarId.trim()
    ? config.calendarId
    : 'primary';

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
  const busyIntervals = await fetchGoogleCalendarBusyIntervals(
    integration,
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
  );

  const suggestedSlots: CalendarSlot[] = [];
  let exactMatch: CalendarSlot | null = null;

  for (let offsetDays = 0; offsetDays < lookAheadDays && suggestedSlots.length < maxSlots; offsetDays += 1) {
    const candidateDay = new Date(rangeStart.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const candidateDate = formatLocalDate(candidateDay, input.timezone);
    if (closedDates.has(candidateDate)) {
      continue;
    }

    const schedule = normalizeScheduleEntry(
      input.operatingSchedule,
      getDayKey(candidateDay, input.timezone),
    );
    if (!schedule) {
      continue;
    }

    const startTime = parseTimeString(schedule.start);
    const endTime = parseTimeString(schedule.end);
    if (!startTime || !endTime) {
      continue;
    }

    const openAt = makeDateInTimeZone(
      input.timezone,
      Number(candidateDate.slice(0, 4)),
      Number(candidateDate.slice(5, 7)),
      Number(candidateDate.slice(8, 10)),
      startTime.hour,
      startTime.minute,
    );
    const closeAt = makeDateInTimeZone(
      input.timezone,
      Number(candidateDate.slice(0, 4)),
      Number(candidateDate.slice(5, 7)),
      Number(candidateDate.slice(8, 10)),
      endTime.hour,
      endTime.minute,
    );
    const breakIntervals = schedule.breaks
      .map((period) => {
        const breakStart = parseTimeString(period.start);
        const breakEnd = parseTimeString(period.end);
        if (!breakStart || !breakEnd) return null;

        return {
          startMs: makeDateInTimeZone(
            input.timezone,
            Number(candidateDate.slice(0, 4)),
            Number(candidateDate.slice(5, 7)),
            Number(candidateDate.slice(8, 10)),
            breakStart.hour,
            breakStart.minute,
          ).getTime(),
          endMs: makeDateInTimeZone(
            input.timezone,
            Number(candidateDate.slice(0, 4)),
            Number(candidateDate.slice(5, 7)),
            Number(candidateDate.slice(8, 10)),
            breakEnd.hour,
            breakEnd.minute,
          ).getTime(),
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
      if (overlapsRange(slotStart.getTime(), slotEnd.getTime(), breakIntervals)) {
        continue;
      }
      if (overlapsRange(slotStart.getTime(), occupancyEnd.getTime(), busyIntervals)) {
        continue;
      }

      if (!slotMatchesRequestedPeriod(slotStart, input.timezone, input.requestedPeriod)) {
        continue;
      }

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
        if (suggestedSlots.length === 0) {
          suggestedSlots.push(slot);
        }
        break;
      }

      suggestedSlots.push(slot);
      if (suggestedSlots.length >= maxSlots) {
        break;
      }
    }

    if (exactMatch) {
      break;
    }
  }

  return { requestedDate, exactMatch, suggestedSlots };
}

export async function createGoogleCalendarAppointment(
  input: CreateCalendarAppointmentInput,
): Promise<{ eventId: string; htmlLink?: string; slot: CalendarSlot }> {
  const integration = await getActiveGoogleCalendarIntegration(input.tenantId);
  if (!integration) {
    throw new ValidationError('Google Calendar is not connected for this clinic');
  }

  const { accessToken } = await resolveValidGoogleAccessToken(integration);
  const config = (integration.config ?? {}) as Record<string, unknown>;
  const calendarId = typeof config.calendarId === 'string' && config.calendarId.trim()
    ? config.calendarId
    : 'primary';

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
          `Age: ${input.patient.age}`,
          `Phone: ${input.patient.phoneNumber}`,
          `Reason for visit: ${input.patient.reasonForVisit}`,
        ].join('\n'),
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
    throw new IntegrationError(
      'calendar',
      'google_calendar',
      `Failed to create Google Calendar event: ${errorBody.slice(0, 500)}`,
    );
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
