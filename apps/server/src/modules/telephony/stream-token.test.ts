import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../lib/errors.js';

const mockEnv = vi.hoisted(() => ({
  JWT_SECRET: 'test-stream-token-secret-minimum-32-chars',
}));

vi.mock('../../config/env.js', () => ({ env: mockEnv }));

import {
  assertMediaStreamCallSessionMatchesToken,
  createMediaStreamToken,
  verifyMediaStreamBinding,
  verifyMediaStreamToken,
} from './stream-token.js';

const NOW_MS = 1_800_000_000_000;

const baseInput = {
  tenantId: 'tenant-a',
  callSessionId: 'call-session-a',
  callSid: 'CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  configVersionId: 'config-version-a',
  nowMs: NOW_MS,
};

function createToken(): string {
  return createMediaStreamToken(baseInput);
}

describe('media stream token signing', () => {
  it('round-trips signed stream token claims', () => {
    const claims = verifyMediaStreamToken(createToken(), NOW_MS);

    expect(claims).toMatchObject({
      tenantId: baseInput.tenantId,
      callSessionId: baseInput.callSessionId,
      callSid: baseInput.callSid,
      configVersionId: baseInput.configVersionId,
    });
  });

  it('rejects missing stream tokens', () => {
    expect(() => verifyMediaStreamToken(undefined, NOW_MS)).toThrow(ValidationError);
  });

  it('rejects tampered stream tokens', () => {
    const token = createToken();
    const [payload, signature] = token.split('.');
    const tampered = `${payload}x.${signature}`;

    expect(() => verifyMediaStreamToken(tampered, NOW_MS)).toThrow(ValidationError);
  });

  it('rejects expired stream tokens', () => {
    const token = createMediaStreamToken({
      ...baseInput,
      ttlSeconds: 1,
    });

    expect(() => verifyMediaStreamToken(token, NOW_MS + 1_000)).toThrow(ValidationError);
  });
});

describe('media stream binding validation', () => {
  it('accepts matching path, Twilio CallSid, custom parameters, and persisted call session', () => {
    const claims = verifyMediaStreamBinding({
      token: createToken(),
      pathCallSessionId: baseInput.callSessionId,
      startCallSid: baseInput.callSid,
      customTenantId: baseInput.tenantId,
      customConfigVersionId: baseInput.configVersionId,
      customCallSessionId: baseInput.callSessionId,
      nowMs: NOW_MS,
    });

    expect(() =>
      assertMediaStreamCallSessionMatchesToken(claims, {
        tenantId: baseInput.tenantId,
        configVersionId: baseInput.configVersionId,
        twilioCallSid: baseInput.callSid,
      }),
    ).not.toThrow();
  });

  it('rejects a token bound to a different call session path', () => {
    expect(() =>
      verifyMediaStreamBinding({
        token: createToken(),
        pathCallSessionId: 'call-session-b',
        startCallSid: baseInput.callSid,
        nowMs: NOW_MS,
      }),
    ).toThrow(ValidationError);
  });

  it('rejects a token bound to a different Twilio CallSid', () => {
    expect(() =>
      verifyMediaStreamBinding({
        token: createToken(),
        pathCallSessionId: baseInput.callSessionId,
        startCallSid: 'CAbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        nowMs: NOW_MS,
      }),
    ).toThrow(ValidationError);
  });

  it('rejects spoofed custom tenant parameters', () => {
    expect(() =>
      verifyMediaStreamBinding({
        token: createToken(),
        pathCallSessionId: baseInput.callSessionId,
        startCallSid: baseInput.callSid,
        customTenantId: 'tenant-b',
        nowMs: NOW_MS,
      }),
    ).toThrow(ValidationError);
  });

  it('rejects persisted call sessions that do not match the token', () => {
    const claims = verifyMediaStreamToken(createToken(), NOW_MS);

    expect(() =>
      assertMediaStreamCallSessionMatchesToken(claims, {
        tenantId: 'tenant-b',
        configVersionId: baseInput.configVersionId,
        twilioCallSid: baseInput.callSid,
      }),
    ).toThrow(ValidationError);
  });
});
