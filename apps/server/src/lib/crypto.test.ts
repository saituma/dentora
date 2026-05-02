import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateId,
  generateCorrelationId,
} from './crypto.js';

describe('hashPassword / verifyPassword', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('my-secret-password');
    expect(hash).not.toBe('my-secret-password');
    expect(await verifyPassword('my-secret-password', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('produces different hashes for the same input (salt)', async () => {
    const h1 = await hashPassword('same');
    const h2 = await hashPassword('same');
    expect(h1).not.toBe(h2);
  });
});

describe('signAccessToken / verifyAccessToken', () => {
  const payload = { userId: 'u1', tenantId: 't1', role: 'admin' };

  it('signs and verifies a token', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe('u1');
    expect(decoded.tenantId).toBe('t1');
    expect(decoded.role).toBe('admin');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(payload);
    const tampered = token.slice(0, -4) + 'xxxx';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('rejects a completely invalid string', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
  });
});

describe('signRefreshToken / verifyRefreshToken', () => {
  const payload = { userId: 'u1', tenantId: 't1', sessionId: 's1' };

  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken(payload);
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe('u1');
    expect(decoded.sessionId).toBe('s1');
  });

  it('rejects a tampered refresh token', () => {
    const token = signRefreshToken(payload);
    const tampered = token.slice(0, -4) + 'xxxx';
    expect(() => verifyRefreshToken(tampered)).toThrow();
  });
});

describe('generateId', () => {
  it('returns a UUID string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('generateCorrelationId', () => {
  it('has corr_ prefix', () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^corr_[a-f0-9]{24}$/);
  });
});
