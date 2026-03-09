import { cache, getRedis, globalKey } from '../../lib/cache.js';
import { encrypt } from '../../lib/encryption.js';
import { ValidationError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { generateId } from '../../lib/crypto.js';
import { activateIntegration, upsertIntegration } from './integration-registry.js';
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_OAUTH_STATE_DOMAIN,
  GOOGLE_OAUTH_STATE_TTL_SECONDS,
  assertGoogleOAuthConfigured,
  exchangeGoogleAuthCode,
  fetchGoogleCalendarIdentity,
  getAccessTokenExpiry,
} from './google-calendar.shared.js';
import type { GoogleOAuthStatePayload } from './integration.types.js';

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

  await cache.setGlobal(GOOGLE_OAUTH_STATE_DOMAIN, state, JSON.stringify(payload), GOOGLE_OAUTH_STATE_TTL_SECONDS);

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
