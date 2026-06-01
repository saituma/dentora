import { env } from '../../../../config/env.js';
import { decrypt, encrypt } from '../../../../lib/encryption.js';
import type { Integration } from '../../../integrations/integration.types.js';
import { DentallyAuthError, DentallyConfigurationError } from './dentally.errors.js';
import type {
  DentallyAuthContext,
  DentallyConfig,
  DentallyPlainCredentialsInput,
  DentallyStoredCredentials,
} from './dentally.types.js';

const EXPIRY_SKEW_MS = 60_000;

export const DENTALLY_REQUIRED_SCOPES = [
  'appointment:read',
  'appointment:create',
  'appointment:update',
  'patient:read',
  'patient:create',
  'patient:update',
  'practice:read',
  'user:read',
] as const;

type DentallyRequiredScope = (typeof DENTALLY_REQUIRED_SCOPES)[number];

const BROAD_SCOPE_PREFIX: Record<DentallyRequiredScope, string> = {
  'appointment:read': 'appointment',
  'appointment:create': 'appointment',
  'appointment:update': 'appointment',
  'patient:read': 'patient',
  'patient:create': 'patient',
  'patient:update': 'patient',
  'practice:read': 'practice',
  'user:read': 'user',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function optionalNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .map((item) => optionalString(item))
    .filter((item): item is string => Boolean(item));
  return values.length > 0 ? values : undefined;
}

function encryptedOrPlain(
  credentials: Record<string, unknown>,
  encryptedKey: string,
  plainKey: string,
): string | undefined {
  return optionalString(credentials[encryptedKey]) ?? optionalString(credentials[plainKey]);
}

function validatePath(name: keyof DentallyConfig, value: string): string {
  const path = value.trim();
  if (!path.startsWith('/')) {
    throw new DentallyConfigurationError(`Dentally ${name} must start with "/"`);
  }
  if (path.includes('://') || /[\r\n]/.test(path)) {
    throw new DentallyConfigurationError(`Dentally ${name} must be a relative API path`);
  }
  return path === '/' ? path : path.replace(/\/+$/, '');
}

function validateHeaderName(name: keyof DentallyConfig, value: string): string {
  const header = value.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(header)) {
    throw new DentallyConfigurationError(`Dentally ${name} is not a valid HTTP header name`);
  }
  return header;
}

function validateBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new DentallyConfigurationError(
        'Dentally baseUrl must use https outside local development',
      );
    }
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
    return url.toString().replace(/\/+$/, '');
  } catch (error) {
    if (error instanceof DentallyConfigurationError) throw error;
    throw new DentallyConfigurationError('Dentally baseUrl must be a valid URL');
  }
}

export function validateDentallyConfig(config: DentallyConfig): DentallyConfig {
  return {
    ...config,
    baseUrl: validateBaseUrl(config.baseUrl),
    appointmentPath: validatePath('appointmentPath', config.appointmentPath),
    patientPath: validatePath('patientPath', config.patientPath),
    clinicianPath: validatePath('clinicianPath', config.clinicianPath),
    roomPath: validatePath('roomPath', config.roomPath),
    webhookPath: validatePath('webhookPath', config.webhookPath),
    authPath: validatePath('authPath', config.authPath),
    signatureHeader: validateHeaderName('signatureHeader', config.signatureHeader),
    timestampHeader: validateHeaderName('timestampHeader', config.timestampHeader),
    replayWindowSeconds: Math.max(1, Math.min(3600, config.replayWindowSeconds)),
    timeoutMs: Math.max(500, Math.min(60000, config.timeoutMs)),
    maxRetries: Math.max(0, Math.min(5, config.maxRetries)),
  };
}

function defaultDentallyConfig(): DentallyConfig {
  return validateDentallyConfig({
    baseUrl: env.DENTALLY_API_BASE_URL,
    appointmentPath: env.DENTALLY_APPOINTMENT_PATH,
    patientPath: env.DENTALLY_PATIENT_PATH,
    clinicianPath: env.DENTALLY_CLINICIAN_PATH,
    roomPath: env.DENTALLY_ROOM_PATH,
    webhookPath: env.DENTALLY_WEBHOOK_PATH,
    authPath: env.DENTALLY_AUTH_PATH,
    signatureHeader: env.DENTALLY_WEBHOOK_SIGNATURE_HEADER,
    timestampHeader: env.DENTALLY_WEBHOOK_TIMESTAMP_HEADER,
    replayWindowSeconds: env.DENTALLY_WEBHOOK_REPLAY_WINDOW_SECONDS,
    timeoutMs: env.DENTALLY_REQUEST_TIMEOUT_MS,
    maxRetries: env.DENTALLY_MAX_RETRIES,
    readOnly: false,
  });
}

const DEFAULT_DENTALLY_CONFIG = defaultDentallyConfig();

export function isDentallyFeatureEnabled(): boolean {
  return process.env.ENABLE_DENTALLY === 'true' || env.ENABLE_DENTALLY;
}

export function dentallyConfigFromIntegration(integration: Integration): DentallyConfig {
  const config = isRecord(integration.config) ? integration.config : {};
  const defaults = DEFAULT_DENTALLY_CONFIG;
  return validateDentallyConfig({
    ...defaults,
    baseUrl: optionalString(config.baseUrl) ?? defaults.baseUrl,
    appointmentPath: optionalString(config.appointmentPath) ?? defaults.appointmentPath,
    patientPath: optionalString(config.patientPath) ?? defaults.patientPath,
    clinicianPath: optionalString(config.clinicianPath) ?? defaults.clinicianPath,
    roomPath: optionalString(config.roomPath) ?? defaults.roomPath,
    webhookPath: optionalString(config.webhookPath) ?? defaults.webhookPath,
    authPath: optionalString(config.authPath) ?? defaults.authPath,
    signatureHeader: optionalString(config.signatureHeader) ?? defaults.signatureHeader,
    timestampHeader: optionalString(config.timestampHeader) ?? defaults.timestampHeader,
    replayWindowSeconds: optionalPositiveInteger(
      config.replayWindowSeconds,
      defaults.replayWindowSeconds,
    ),
    timeoutMs: optionalPositiveInteger(config.timeoutMs, defaults.timeoutMs),
    maxRetries: optionalNonNegativeInteger(config.maxRetries, defaults.maxRetries),
    accountId: optionalString(config.accountId),
    practiceId: optionalString(config.practiceId),
    practiceName: optionalString(config.practiceName),
    readOnly: config.readOnly === true,
  });
}

export function dentallyCredentialsFromIntegration(
  integration: Integration,
): DentallyStoredCredentials {
  const credentials = isRecord(integration.credentials) ? integration.credentials : {};
  return {
    encryptedAccessToken: encryptedOrPlain(credentials, 'encryptedAccessToken', 'accessToken'),
    encryptedRefreshToken: encryptedOrPlain(credentials, 'encryptedRefreshToken', 'refreshToken'),
    accessTokenExpiresAt: optionalString(credentials.accessTokenExpiresAt),
    scopes: optionalStringArray(credentials.scopes),
    tokenType: optionalString(credentials.tokenType),
    accountId: optionalString(credentials.accountId),
    practiceId: optionalString(credentials.practiceId),
    practiceName: optionalString(credentials.practiceName),
    encryptedClientId: encryptedOrPlain(credentials, 'encryptedClientId', 'clientId'),
    encryptedClientSecret: encryptedOrPlain(credentials, 'encryptedClientSecret', 'clientSecret'),
    encryptedWebhookSecret: encryptedOrPlain(
      credentials,
      'encryptedWebhookSecret',
      'webhookSecret',
    ),
  };
}

export function encryptDentallyCredentialsForStorage(
  credentials: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!credentials) return undefined;
  const input: DentallyPlainCredentialsInput & DentallyStoredCredentials = {
    accessToken: optionalString(credentials.accessToken),
    refreshToken: optionalString(credentials.refreshToken),
    accessTokenExpiresAt: optionalString(credentials.accessTokenExpiresAt),
    scopes: optionalStringArray(credentials.scopes),
    tokenType: optionalString(credentials.tokenType),
    accountId: optionalString(credentials.accountId),
    practiceId: optionalString(credentials.practiceId),
    practiceName: optionalString(credentials.practiceName),
    clientId: optionalString(credentials.clientId),
    clientSecret: optionalString(credentials.clientSecret),
    webhookSecret: optionalString(credentials.webhookSecret),
    encryptedAccessToken: optionalString(credentials.encryptedAccessToken),
    encryptedRefreshToken: optionalString(credentials.encryptedRefreshToken),
    encryptedClientId: optionalString(credentials.encryptedClientId),
    encryptedClientSecret: optionalString(credentials.encryptedClientSecret),
    encryptedWebhookSecret: optionalString(credentials.encryptedWebhookSecret),
  };

  return {
    encryptedAccessToken:
      input.encryptedAccessToken ?? (input.accessToken ? encrypt(input.accessToken) : undefined),
    encryptedRefreshToken:
      input.encryptedRefreshToken ?? (input.refreshToken ? encrypt(input.refreshToken) : undefined),
    accessTokenExpiresAt: input.accessTokenExpiresAt,
    scopes: input.scopes,
    tokenType: input.tokenType,
    accountId: input.accountId,
    practiceId: input.practiceId,
    practiceName: input.practiceName,
    encryptedClientId:
      input.encryptedClientId ?? (input.clientId ? encrypt(input.clientId) : undefined),
    encryptedClientSecret:
      input.encryptedClientSecret ?? (input.clientSecret ? encrypt(input.clientSecret) : undefined),
    encryptedWebhookSecret:
      input.encryptedWebhookSecret ??
      (input.webhookSecret ? encrypt(input.webhookSecret) : undefined),
  };
}

function decryptSecret(encryptedValue: string, label: string): string {
  try {
    return decrypt(encryptedValue);
  } catch {
    throw new DentallyAuthError(`Failed to decrypt Dentally ${label}`);
  }
}

function tokenExpiresAtMs(expiresAt: string | undefined): number {
  if (!expiresAt) {
    throw new DentallyAuthError('Dentally access token expiry is required');
  }
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    throw new DentallyAuthError('Dentally access token expiry is invalid');
  }
  return expiresAtMs;
}

export function hasDentallyScope(
  scopes: readonly string[],
  required: DentallyRequiredScope,
): boolean {
  const normalized = new Set(scopes.map((scope) => scope.trim()).filter(Boolean));
  return normalized.has(required) || normalized.has(BROAD_SCOPE_PREFIX[required]);
}

// A practice can self-issue a read-only token (no partner approval) with just these.
export const DENTALLY_READ_ONLY_REQUIRED_SCOPES = ['patient:read', 'appointment:read'] as const;

export function missingDentallyScopes(
  scopes: readonly string[] | undefined,
  readOnly = false,
): string[] {
  const required = readOnly ? DENTALLY_READ_ONLY_REQUIRED_SCOPES : DENTALLY_REQUIRED_SCOPES;
  if (!scopes || scopes.length === 0) return [...required];
  return required.filter((scope) => !hasDentallyScope(scopes, scope));
}

function practiceMetadata(input: {
  config: DentallyConfig;
  credentials: DentallyStoredCredentials;
}): { practiceId: string; practiceName: string } {
  const practiceId = input.credentials.practiceId ?? input.config.practiceId;
  const practiceName = input.credentials.practiceName ?? input.config.practiceName;
  if (!practiceId || !practiceName) {
    throw new DentallyAuthError('Dentally practice metadata is required');
  }
  return { practiceId, practiceName };
}

export function validateDentallyCredentials(input: {
  config: DentallyConfig;
  credentials: DentallyStoredCredentials;
}): void {
  const readOnly = input.config.readOnly;
  if (!input.credentials.encryptedAccessToken) {
    throw new DentallyAuthError('Dentally access token is required');
  }
  // Partner OAuth tokens rotate, so a refresh token + expiry are mandatory. A practice-issued
  // read-only token is static: no refresh token, and an expiry only if Dentally set one.
  if (!readOnly && !input.credentials.encryptedRefreshToken) {
    throw new DentallyAuthError('Dentally OAuth refresh token is required');
  }
  if (!readOnly || input.credentials.accessTokenExpiresAt) {
    const expiresAtMs = tokenExpiresAtMs(input.credentials.accessTokenExpiresAt);
    if (expiresAtMs <= Date.now() + EXPIRY_SKEW_MS) {
      throw new DentallyAuthError('Dentally access token is expired');
    }
  }
  if (input.credentials.tokenType && input.credentials.tokenType.toLowerCase() !== 'bearer') {
    throw new DentallyAuthError('Dentally token type must be Bearer');
  }
  const missingScopes = missingDentallyScopes(input.credentials.scopes, readOnly);
  if (missingScopes.length > 0) {
    throw new DentallyAuthError(
      `Dentally credentials are missing scopes: ${missingScopes.join(', ')}`,
    );
  }
  practiceMetadata(input);
}

export async function resolveDentallyAuthContext(
  integration: Integration,
): Promise<DentallyAuthContext> {
  if (integration.provider !== 'dentally') {
    throw new DentallyConfigurationError('Integration is not configured for Dentally');
  }

  const config = dentallyConfigFromIntegration(integration);
  const credentials = dentallyCredentialsFromIntegration(integration);
  validateDentallyCredentials({ config, credentials });
  if (!credentials.encryptedAccessToken) {
    throw new DentallyAuthError('Dentally credentials are incomplete');
  }
  if (!config.readOnly && !credentials.encryptedRefreshToken) {
    throw new DentallyAuthError('Dentally OAuth credentials are incomplete');
  }

  const token = decryptSecret(credentials.encryptedAccessToken, 'access token');
  if (credentials.encryptedRefreshToken) {
    decryptSecret(credentials.encryptedRefreshToken, 'refresh token');
  }

  return {
    baseUrl: config.baseUrl,
    authorizationHeader: `Bearer ${token}`,
    correlationId: integration.id,
    integrationId: integration.id,
    tenantId: integration.tenantId,
    config,
    credentials,
  };
}

export function decryptDentallyWebhookSecret(integration: Integration): string | null {
  const credentials = dentallyCredentialsFromIntegration(integration);
  if (!credentials.encryptedWebhookSecret) return null;
  return decryptSecret(credentials.encryptedWebhookSecret, 'webhook secret');
}
