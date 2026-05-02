import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authMiddleware, requireRole } from './auth.js';
import { signAccessToken } from '../lib/crypto.js';
import { AuthenticationError, AuthorizationError } from '../lib/errors.js';

function mockReqResNext() {
  const req = { headers: {} } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe('authMiddleware', () => {
  it('attaches user payload for a valid token', () => {
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'admin' });
    const { req, res, next } = mockReqResNext();
    req.headers.authorization = `Bearer ${token}`;

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user!.userId).toBe('u1');
    expect(req.user!.role).toBe('admin');
  });

  it('rejects missing Authorization header', () => {
    const { req, res, next } = mockReqResNext();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  it('rejects non-Bearer scheme', () => {
    const { req, res, next } = mockReqResNext();
    req.headers.authorization = 'Basic abc123';

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  it('rejects an expired / invalid token', () => {
    const { req, res, next } = mockReqResNext();
    req.headers.authorization = 'Bearer invalid.token.here';

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });
});

describe('requireRole', () => {
  it('allows matching role', () => {
    const middleware = requireRole('admin', 'owner');
    const { req, res, next } = mockReqResNext();
    req.user = { userId: 'u1', tenantId: 't1', role: 'admin' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects non-matching role', () => {
    const middleware = requireRole('platform_admin');
    const { req, res, next } = mockReqResNext();
    req.user = { userId: 'u1', tenantId: 't1', role: 'viewer' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
  });

  it('rejects unauthenticated requests', () => {
    const middleware = requireRole('admin');
    const { req, res, next } = mockReqResNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });
});
