import { db } from '../../db/index.js';
import { integrations } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { decrypt, encrypt } from '../../lib/encryption.js';
import { IntegrationError, ValidationError } from '../../lib/errors.js';
import type {
  GoogleCalendarIdentity,
  GoogleTokenResponse,
  Integration,
} from './integration.types.js';

export const GOOGLE_OAUTH_STATE_DOMAIN = 'google-calendar-oauth';
export const GOOGLE_OAUTH_STATE_TTL_SECONDS = 600;
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export function assertGoogleOAuthConfigured(): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new ValidationError('Google Calendar OAuth is not configured in environment variables');
  }
}

export function getAccessTokenExpiry(expiresInSeconds?: number): string | undefined {
  if (!expiresInSeconds || Number.isNaN(expiresInSeconds)) return undefined;
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now() + 60_000;
}

export function getFormatterParts(date: Date, timezone: string): Record<string, string> {
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

export function makeDateInTimeZone(
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

export function formatLocalDate(date: Date, timezone: string): string {
  const parts = getFormatterParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getDayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(date).toLowerCase();
}

export function formatSlotLabel(startIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startIso));
}

export function parseTimeString(value?: string | null): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

export async function exchangeGoogleAuthCode(code: string): Promise<GoogleTokenResponse> {
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

export async function fetchGoogleCalendarIdentity(accessToken: string): Promise<GoogleCalendarIdentity> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=10', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new IntegrationError('calendar', 'google_calendar', 'Failed to read Google Calendar list');
  }

  const payload = (await response.json()) as {
    items?: Array<{ id?: string; primary?: boolean }>;
  };
  const primary = payload.items?.find((item) => item.primary) || payload.items?.[0];
  const primaryId = primary?.id;

  return {
    accountEmail: primaryId,
    calendarId: primaryId || 'primary',
  };
}

export async function resolveValidGoogleAccessToken(integration: Integration): Promise<{ accessToken: string; integration: Integration }> {
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
    try {
      return { accessToken: decrypt(encryptedAccessToken), integration };
    } catch (error) {
      throw new IntegrationError(
        'calendar',
        'google_calendar',
        'Failed to decrypt Google access token. Please reconnect Google Calendar.',
      );
    }
  }

  if (!encryptedRefreshToken) {
    throw new IntegrationError('calendar', 'google_calendar', 'Google access token expired and no refresh token is available');
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(encryptedRefreshToken);
  } catch (error) {
    throw new IntegrationError(
      'calendar',
      'google_calendar',
      'Failed to decrypt Google refresh token. Please reconnect Google Calendar.',
    );
  }

  const refreshed = await refreshGoogleAccessToken(refreshToken);
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
