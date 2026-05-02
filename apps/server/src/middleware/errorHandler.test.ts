import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler } from './errorHandler.js';
import { AppError, AuthenticationError, ValidationError } from '../lib/errors.js';

function mockRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json } as unknown as Response;
}

function mockReq(overrides: Partial<Request> = {}) {
  return { path: '/test', method: 'GET', headers: {}, ...overrides } as unknown as Request;
}

describe('errorHandler', () => {
  it('returns structured error for AppError subclass', () => {
    const err = new AuthenticationError('bad creds');
    const res = mockRes();
    const req = mockReq();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.status as any).mock.results[0].value.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'AUTHENTICATION_REQUIRED',
          message: 'bad creds',
        }),
      }),
    );
  });

  it('returns 422 for ValidationError with details', () => {
    const err = new ValidationError('bad input', [{ path: 'email', message: 'required' }]);
    const res = mockRes();

    errorHandler(err, mockReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('returns 500 for unknown errors without leaking internals', () => {
    const err = new Error('db connection lost');
    const res = mockRes();

    errorHandler(err, mockReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.status as any).mock.results[0].value.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        }),
      }),
    );
  });

  it('includes correlationId from tenant context', () => {
    const err = new AuthenticationError();
    const res = mockRes();
    const req = mockReq({ tenantContext: { correlationId: 'corr_abc' } } as any);

    errorHandler(err, req, res, vi.fn());

    expect((res.status as any).mock.results[0].value.json).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr_abc' }),
    );
  });
});

describe('notFoundHandler', () => {
  it('creates a 404 AppError and calls next', () => {
    const next = vi.fn();
    notFoundHandler(mockReq({ method: 'POST', path: '/api/missing' }) as Request, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('/api/missing');
  });
});
