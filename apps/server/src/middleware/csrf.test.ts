import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { csrfProtection } from './csrf.js';

function mockReqResNext(overrides: Partial<Request> = {}) {
  const req = {
    method: 'POST',
    path: '/api/test',
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn();

  return { req, res, next };
}

describe('csrfProtection', () => {
  it.each([
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/auth/google/exchange',
  ])('rejects missing CSRF for cookie-backed auth endpoint %s', (path) => {
    const { req, res, next } = mockReqResNext({ path });

    csrfProtection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'CSRF token validation failed' });
  });

  it.each([
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/auth/google/exchange',
  ])('does not allow Bearer auth to bypass CSRF for cookie-backed auth endpoint %s', (path) => {
    const { req, res, next } = mockReqResNext({
      path,
      headers: { authorization: 'Bearer access-token' },
    });

    csrfProtection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it.each([
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/auth/google/exchange',
  ])('allows valid double-submit CSRF for cookie-backed auth endpoint %s', (path) => {
    const { req, res, next } = mockReqResNext({
      path,
      headers: { 'x-csrf-token': 'csrf-token' },
      cookies: { 'csrf-token': 'csrf-token' },
    });

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/email/send-otp',
    '/api/auth/email/verify-otp',
    '/api/auth/phone/send-otp',
    '/api/auth/phone/verify-otp',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
  ])('keeps public auth POST route working without CSRF: %s', (path) => {
    const { req, res, next } = mockReqResNext({ path });

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('keeps safe auth GET routes working without CSRF', () => {
    const { req, res, next } = mockReqResNext({
      method: 'GET',
      path: '/api/auth/google/callback',
    });

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still allows Bearer-token protected non-auth writes without CSRF', () => {
    const { req, res, next } = mockReqResNext({
      path: '/api/tenants/t1/config',
      headers: { authorization: 'Bearer access-token' },
    });

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
