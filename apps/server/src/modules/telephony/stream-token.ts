import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { ValidationError } from '../../lib/errors.js';

const MEDIA_STREAM_TOKEN_TTL_SECONDS = 120;

export interface MediaStreamTokenClaims {
  tenantId: string;
  callSessionId: string;
  callSid: string;
  configVersionId: string;
  exp: number;
}

export interface CreateMediaStreamTokenInput {
  tenantId: string;
  callSessionId: string;
  callSid: string;
  configVersionId: string;
  ttlSeconds?: number;
  nowMs?: number;
}

export interface VerifyMediaStreamBindingInput {
  token: string | undefined;
  pathCallSessionId: string;
  startCallSid: string | undefined;
  customTenantId?: string;
  customConfigVersionId?: string;
  customCallSessionId?: string;
  nowMs?: number;
}

export interface PersistedMediaStreamCallSession {
  tenantId: string;
  configVersionId: string | null;
  twilioCallSid: string | null;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSigningSecret(): string {
  return env.JWT_SECRET;
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseClaims(raw: string): MediaStreamTokenClaims {
  const parsed = JSON.parse(raw) as Partial<MediaStreamTokenClaims>;
  if (
    typeof parsed.tenantId !== 'string' ||
    typeof parsed.callSessionId !== 'string' ||
    typeof parsed.callSid !== 'string' ||
    typeof parsed.configVersionId !== 'string' ||
    typeof parsed.exp !== 'number'
  ) {
    throw new ValidationError('Invalid media stream token claims');
  }

  return {
    tenantId: parsed.tenantId,
    callSessionId: parsed.callSessionId,
    callSid: parsed.callSid,
    configVersionId: parsed.configVersionId,
    exp: parsed.exp,
  };
}

export function createMediaStreamToken(input: CreateMediaStreamTokenInput): string {
  const nowMs = input.nowMs ?? Date.now();
  const ttlSeconds = input.ttlSeconds ?? MEDIA_STREAM_TOKEN_TTL_SECONDS;
  const claims: MediaStreamTokenClaims = {
    tenantId: input.tenantId,
    callSessionId: input.callSessionId,
    callSid: input.callSid,
    configVersionId: input.configVersionId,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };

  const payload = base64UrlEncode(JSON.stringify(claims));
  return `${payload}.${signPayload(payload)}`;
}

export function verifyMediaStreamToken(
  token: string | undefined,
  nowMs = Date.now(),
): MediaStreamTokenClaims {
  if (!token) {
    throw new ValidationError('Missing media stream token');
  }

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) {
    throw new ValidationError('Invalid media stream token');
  }

  const expectedSignature = signPayload(payload);
  if (!signaturesMatch(signature, expectedSignature)) {
    throw new ValidationError('Invalid media stream token signature');
  }

  const claims = parseClaims(base64UrlDecode(payload));
  if (claims.exp <= Math.floor(nowMs / 1000)) {
    throw new ValidationError('Expired media stream token');
  }

  return claims;
}

export function verifyMediaStreamBinding(
  input: VerifyMediaStreamBindingInput,
): MediaStreamTokenClaims {
  const claims = verifyMediaStreamToken(input.token, input.nowMs);

  if (claims.callSessionId !== input.pathCallSessionId) {
    throw new ValidationError('Media stream token call session mismatch');
  }

  if (!input.startCallSid || claims.callSid !== input.startCallSid) {
    throw new ValidationError('Media stream token call SID mismatch');
  }

  if (input.customTenantId && input.customTenantId !== claims.tenantId) {
    throw new ValidationError('Media stream tenant mismatch');
  }

  if (input.customConfigVersionId && input.customConfigVersionId !== claims.configVersionId) {
    throw new ValidationError('Media stream config version mismatch');
  }

  if (input.customCallSessionId && input.customCallSessionId !== claims.callSessionId) {
    throw new ValidationError('Media stream call session mismatch');
  }

  return claims;
}

export function assertMediaStreamCallSessionMatchesToken(
  claims: MediaStreamTokenClaims,
  callSession: PersistedMediaStreamCallSession | undefined,
): void {
  if (!callSession) {
    throw new ValidationError('Media stream call session not found');
  }

  if (
    callSession.tenantId !== claims.tenantId ||
    callSession.configVersionId !== claims.configVersionId ||
    callSession.twilioCallSid !== claims.callSid
  ) {
    throw new ValidationError('Media stream token does not match persisted call session');
  }
}
