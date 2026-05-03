import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ db: mockDb }));
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

import { login, register, refreshAccessToken, logout, changePassword } from './auth.service.js';
import { hashPassword, signRefreshToken } from '../../lib/crypto.js';
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
  vi.clearAllMocks();
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
    mockDb.insert.mockReturnValue(insertChain({}));

    const result = await login('test@example.com', 'password123');

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.id).toBe('u1');
    expect(result.user.email).toBe('test@example.com');
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
    mockDb.select.mockReturnValueOnce(chainable({ tenantId: 't1' }));

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
      refreshToken,
      previousRefreshToken: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    };
    const fakeUser = { id: 'u1', email: 'a@b.com', role: 'admin', displayName: 'Test' };

    mockDb.select
      .mockReturnValueOnce(chainable(fakeSession))
      .mockReturnValueOnce(chainable(fakeUser))
      .mockReturnValueOnce(chainable({ tenantId: 't1' }));
    mockDb.update.mockReturnValue(updateChain());

    const result = await refreshAccessToken(refreshToken);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    // Verify the session was updated with rotation fields
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('throws for expired session', async () => {
    const refreshToken = signRefreshToken({ userId: 'u1', tenantId: 't1', sessionId: 's1' });
    const expiredSession = {
      id: 's1',
      userId: 'u1',
      refreshToken,
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
      refreshToken: 'new-token-that-replaced-old',
      previousRefreshToken: oldRefreshToken,
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

describe('changePassword', () => {
  it('updates password when current password is correct', async () => {
    const currentHash = await hashPassword('old-pass');
    const fakeUser = { id: 'u1', passwordHash: currentHash };
    mockDb.select.mockReturnValueOnce(chainable(fakeUser));
    mockDb.update.mockReturnValue(updateChain());

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
