import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

const mockRedis = vi.hoisted(() => ({
  getdel: vi.fn(),
  setex: vi.fn(),
}));

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: 'development' as 'development' | 'staging' | 'production',
  REDIS_DISABLED: false,
  JWT_SECRET: 'test-secret-change-in-production-min32chars',
  JWT_ISSUER: 'dental-flow-test',
  JWT_EXPIRY_SECONDS: 900,
  REFRESH_TOKEN_EXPIRY_DAYS: 7,
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  GOOGLE_AUTH_REDIRECT_URI: 'http://localhost:4000/api/auth/google/callback',
  RESEND_API_KEY: '',
  SMTP_HOST: '',
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: '',
  SMTP_PASS: '',
  SMTP_FROM: '',
  CLIENT_URL: 'http://localhost:3000',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  TWILIO_VERIFY_SERVICE_SID: '',
}));

vi.mock('../../db/index.js', () => ({ db: mockDb }));
vi.mock('../../lib/cache.js', () => ({ getRedis: () => mockRedis }));
vi.mock('../../config/env.js', () => ({ env: mockEnv }));
vi.mock('../../db/schema.js', () => ({
  users: { email: 'email', id: 'id', $inferSelect: {} },
  sessions: {},
  tenantUsers: { userId: 'userId', tenantId: 'tenantId' },
  tenantRegistry: {},
  otpChallenges: { channel: 'channel', target: 'target', id: 'id' },
  authIdentities: { provider: 'provider', providerUserId: 'providerUserId' },
  passwordResetTokens: { tokenHash: 'tokenHash', id: 'id', userId: 'userId' },
}));
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn().mockReturnValue({ sendMail: vi.fn() }) },
}));
vi.mock('twilio', () => ({
  default: vi.fn(),
}));

import { login, register, refreshAccessToken, logout, changePassword, exchangeOauthCode, loginOrRegisterWithGoogleCode } from './auth.service.js';
import { hashPassword, signRefreshToken, hashRefreshToken, verifyAccessToken } from '../../lib/crypto.js';
import { AuthenticationError, ConflictError } from '../../lib/errors.js';

function chainable(result: any) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]);
  return chain;
}

function insertChain(result: any) {
  const chain: any = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]);
  chain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  return chain;
}

function updateChain() {
  const chain: any = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockResolvedValue(undefined);
  return chain;
}

function deleteChain() {
  const chain: any = {};
  chain.where = vi.fn().mockResolvedValue(undefined);
  return chain;
}

beforeEach(() => {
  // resetAllMocks clears both call history AND queued mockReturnValueOnce values,
  // preventing stale return values from leaking between tests.
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  mockEnv.NODE_ENV = 'development';
  mockEnv.REDIS_DISABLED = false;
});

describe('login', () => {
  it('returns tokens for valid credentials', async () => {
    const passwordHash = await hashPassword('password123');
    const fakeUser = {
      id: 'u1',
      email: 'test@example.com',
      passwordHash,
      displayName: 'Test',
      role: 'admin',
    };

    mockDb.select
      .mockReturnValueOnce(chainable(fakeUser))
      .mockReturnValueOnce(chainable({ tenantId: 't1' }));
    const sessionInsert = insertChain({});
    mockDb.insert.mockReturnValue(sessionInsert);

    const result = await login('test@example.com', 'password123');

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.id).toBe('u1');
    expect(result.user.email).toBe('test@example.com');
    expect(sessionInsert.values).toHaveBeenCalledWith(expect.objectContaining({
      refreshToken: hashRefreshToken(result.refreshToken),
    }));
  });

  it('signs tenant membership role for tenant-scoped users', async () => {
    const passwordHash = await hashPassword('password123');
    const fakeUser = {
      id: 'u1',
      email: 'test@example.com',
      passwordHash,
      displayName: 'Test',
      role: 'viewer',
    };

    mockDb.select
      .mockReturnValueOnce(chainable(fakeUser))
      .mockReturnValueOnce(chainable({ tenantId: 't1', role: 'admin' }));
    mockDb.insert.mockReturnValue(insertChain({}));

    const result = await login('test@example.com', 'password123');
    const payload = verifyAccessToken(result.accessToken);

    expect(payload.role).toBe('admin');
    expect(result.user.role).toBe('admin');
  });

  it('preserves platform_admin as the effective token role', async () => {
    const passwordHash = await hashPassword('password123');
    const fakeUser = {
      id: 'u1',
      email: 'platform@example.com',
      passwordHash,
      displayName: 'Platform',
      role: 'platform_admin',
    };

    mockDb.select
      .mockReturnValueOnce(chainable(fakeUser))
      .mockReturnValueOnce(chainable({ tenantId: 't1', role: 'admin' }));
    mockDb.insert.mockReturnValue(insertChain({}));

    const result = await login('platform@example.com', 'password123');
    const payload = verifyAccessToken(result.accessToken);

    expect(payload.role).toBe('platform_admin');
    expect(result.user.role).toBe('platform_admin');
  });

  it('throws AuthenticationError for unknown email', async () => {
    mockDb.select.mockReturnValueOnce(chainable(undefined));

    await expect(login('no@user.com', 'pass')).rejects.toThrow(AuthenticationError);
  });

  it('throws AuthenticationError for wrong password', async () => {
    const passwordHash = await hashPassword('correct');
    const fakeUser = { id: 'u1', email: 'a@b.com', passwordHash, displayName: 'X', role: 'admin' };
    mockDb.select.mockReturnValueOnce(chainable(fakeUser));

    await expect(login('a@b.com', 'wrong')).rejects.toThrow(AuthenticationError);
  });
});

describe('register', () => {
  it('creates user and tenant, returns tokens', async () => {
    mockDb.select.mockReturnValueOnce(chainable(undefined));

    const fakeUser = { id: 'u1', email: 'new@test.com', displayName: 'Clinic', role: 'admin' };
    mockDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([fakeUser]),
          }),
        }),
      };
      return fn(tx);
    });
    mockDb.insert.mockReturnValue(insertChain({}));
    mockDb.select.mockReturnValueOnce(chainable({ tenantId: 't1', role: 'admin' }));

    const result = await register({
      email: 'new@test.com',
      password: 'securepass8',
      clinicName: 'My Clinic',
    });

    expect(result.accessToken).toBeDefined();
    expect(result.user.email).toBe('new@test.com');
  });

  it('throws ConflictError for duplicate email', async () => {
    const existingUser = { id: 'u1', email: 'dupe@test.com' };
    mockDb.select.mockReturnValueOnce(chainable(existingUser));

    await expect(
      register({ email: 'dupe@test.com', password: 'pass1234', clinicName: 'Clinic' }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('refreshAccessToken', () => {
  it('returns new tokens for valid refresh token', async () => {
    const refreshToken = signRefreshToken({ userId: 'u1', tenantId: 't1', sessionId: 's1' });
    const fakeSession = {
      id: 's1',
      userId: 'u1',
      refreshToken: hashRefreshToken(refreshToken),
      previousRefreshToken: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    };
    const fakeUser = { id: 'u1', email: 'a@b.com', role: 'admin', displayName: 'Test' };

    mockDb.select
      .mockReturnValueOnce(chainable(fakeSession))
      .mockReturnValueOnce(chainable(fakeUser))
      .mockReturnValueOnce(chainable({ tenantId: 't1', role: 'admin' }));
    const sessionUpdate = updateChain();
    mockDb.update.mockReturnValue(sessionUpdate);

    const result = await refreshAccessToken(refreshToken);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    // Verify the session was updated with rotation fields
    expect(mockDb.update).toHaveBeenCalled();
    expect(sessionUpdate.set).toHaveBeenCalledWith(expect.objectContaining({
      previousRefreshToken: hashRefreshToken(refreshToken),
      refreshToken: hashRefreshToken(result.refreshToken),
    }));
  });

  it('throws for expired session', async () => {
    const refreshToken = signRefreshToken({ userId: 'u1', tenantId: 't1', sessionId: 's1' });
    const expiredSession = {
      id: 's1',
      userId: 'u1',
      refreshToken: hashRefreshToken(refreshToken),
      previousRefreshToken: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    };

    mockDb.select.mockReturnValueOnce(chainable(expiredSession));

    await expect(refreshAccessToken(refreshToken)).rejects.toThrow(AuthenticationError);
  });

  it('throws for invalid refresh token', async () => {
    await expect(refreshAccessToken('garbage')).rejects.toThrow();
  });

  it('invalidates all sessions on replay of a previously-rotated token', async () => {
    const oldRefreshToken = signRefreshToken({ userId: 'u1', tenantId: 't1', sessionId: 's1' });

    // First select: no session found with this token as current (it was rotated away)
    mockDb.select.mockReturnValueOnce(chainable(undefined));
    // Second select: found session where this token is the previousRefreshToken (replay detected)
    mockDb.select.mockReturnValueOnce(chainable({
      id: 's1',
      userId: 'u1',
      refreshToken: hashRefreshToken('new-token-that-replaced-old'),
      previousRefreshToken: hashRefreshToken(oldRefreshToken),
      rotatedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    }));
    mockDb.delete.mockReturnValue(deleteChain());

    await expect(refreshAccessToken(oldRefreshToken)).rejects.toThrow(
      'Refresh token reuse detected. All sessions have been revoked for security.',
    );
    expect(mockDb.delete).toHaveBeenCalled();
  });

  it('throws session expired when token matches no current or previous session', async () => {
    const refreshToken = signRefreshToken({ userId: 'u1', tenantId: 't1', sessionId: 's1' });

    // No match on current token
    mockDb.select.mockReturnValueOnce(chainable(undefined));
    // No match on previous token either
    mockDb.select.mockReturnValueOnce(chainable(undefined));

    await expect(refreshAccessToken(refreshToken)).rejects.toThrow(AuthenticationError);
  });
});

describe('logout', () => {
  it('deletes the session', async () => {
    mockDb.delete.mockReturnValue(deleteChain());

    await expect(logout('u1', 'some-token')).resolves.not.toThrow();
    expect(mockDb.delete).toHaveBeenCalled();
  });
});

describe('exchangeOauthCode', () => {
  it('consumes the Redis-backed one-time code and rotates hashed refresh storage', async () => {
    mockEnv.REDIS_DISABLED = true;
    const exchangeCode = 'oauth-exchange-code';
    const fakeUser = { id: 'u1', email: 'a@b.com', role: 'viewer', displayName: 'Test' };
    const fakeSession = {
      id: 's1',
      userId: 'u1',
      refreshToken: 'old-hash',
      previousRefreshToken: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    };
    const sessionUpdate = updateChain();

    mockRedis.getdel.mockResolvedValue(JSON.stringify({
      userId: 'u1',
      sessionId: 's1',
      expiresAt: Date.now() + 60_000,
    }));
    mockDb.select
      .mockReturnValueOnce(chainable(fakeUser))
      .mockReturnValueOnce(chainable(fakeSession))
      .mockReturnValueOnce(chainable({ tenantId: 't1', role: 'admin' }));
    mockDb.update.mockReturnValue(sessionUpdate);

    const result = await exchangeOauthCode(exchangeCode);

    expect(mockRedis.getdel).toHaveBeenCalledWith(expect.stringMatching(/^global:oauth_exchange:/));
    expect(result.refreshToken).toBeDefined();
    expect(result.user.role).toBe('admin');
    expect(sessionUpdate.set).toHaveBeenCalledWith(expect.objectContaining({
      refreshToken: hashRefreshToken(result.refreshToken),
      previousRefreshToken: null,
    }));
  });

  it('rejects a missing or already-consumed OAuth exchange code', async () => {
    mockRedis.getdel.mockResolvedValue(null);

    await expect(exchangeOauthCode('missing-code')).rejects.toThrow(AuthenticationError);
  });

  it('rejects OAuth exchange code consumption in production when Redis is disabled', async () => {
    mockEnv.NODE_ENV = 'production';
    mockEnv.REDIS_DISABLED = true;

    await expect(exchangeOauthCode('oauth-exchange-code')).rejects.toThrow(AuthenticationError);
    expect(mockRedis.getdel).not.toHaveBeenCalled();
  });
});

describe('loginOrRegisterWithGoogleCode', () => {
  it('rejects OAuth exchange code creation in production when Redis is disabled', async () => {
    mockEnv.NODE_ENV = 'production';
    mockEnv.REDIS_DISABLED = true;

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'google-access-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: 'google-user-id',
          email: 'oauth@example.com',
          email_verified: true,
          name: 'OAuth User',
        }),
      }));

    const fakeUser = {
      id: 'u1',
      email: 'oauth@example.com',
      passwordHash: 'hash',
      displayName: 'OAuth User',
      role: 'viewer',
    };

    mockDb.select
      .mockReturnValueOnce(chainable(undefined))
      .mockReturnValueOnce(chainable(fakeUser))
      .mockReturnValueOnce(chainable({ tenantId: 't1', role: 'admin' }));
    mockDb.update.mockReturnValue(updateChain());
    mockDb.insert.mockReturnValue(insertChain({}));

    await expect(loginOrRegisterWithGoogleCode({ code: 'google-auth-code', state: 'mock-state' })).rejects.toThrow(AuthenticationError);
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });
});

describe('changePassword', () => {
  it('updates password when current password is correct', async () => {
    const currentHash = await hashPassword('old-pass');
    const fakeUser = { id: 'u1', passwordHash: currentHash };
    mockDb.select.mockReturnValueOnce(chainable(fakeUser));
    mockDb.update.mockReturnValue(updateChain());
    mockDb.delete.mockReturnValue(deleteChain());

    await expect(
      changePassword({ userId: 'u1', currentPassword: 'old-pass', newPassword: 'new-pass1' }),
    ).resolves.not.toThrow();
  });

  it('throws when current password is wrong', async () => {
    const currentHash = await hashPassword('old-pass');
    const fakeUser = { id: 'u1', passwordHash: currentHash };
    mockDb.select.mockReturnValueOnce(chainable(fakeUser));

    await expect(
      changePassword({ userId: 'u1', currentPassword: 'wrong', newPassword: 'new-pass1' }),
    ).rejects.toThrow(AuthenticationError);
  });

  it('throws when user not found', async () => {
    mockDb.select.mockReturnValueOnce(chainable(undefined));

    await expect(
      changePassword({ userId: 'missing', currentPassword: 'x', newPassword: 'y1234567' }),
    ).rejects.toThrow(AuthenticationError);
  });
});
