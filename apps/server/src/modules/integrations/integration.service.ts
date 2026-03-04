
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
}): Promise<{ authUrl: string; state: string }> {
  assertGoogleOAuthConfigured();

  const state = generateId();
  const payload: GoogleOAuthStatePayload = {
    tenantId: input.tenantId,
    accountEmail: input.accountEmail,
    calendarId: input.calendarId,
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
}): Promise<{ tenantId: string; integrationId: string }> {
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
