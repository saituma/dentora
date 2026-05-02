import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { validate } from './validate.js';
import { z } from 'zod';
import { ValidationError } from '../lib/errors.js';

function mockReqResNext(overrides: Partial<Request> = {}) {
  const req = { body: {}, query: {}, params: {}, ...overrides } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe('validate middleware', () => {
  it('passes valid body', () => {
    const mw = validate({ body: z.object({ email: z.string().email() }) });
    const { req, res, next } = mockReqResNext({ body: { email: 'a@b.com' } });

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.email).toBe('a@b.com');
  });

  it('rejects invalid body with ValidationError', () => {
    const mw = validate({ body: z.object({ email: z.string().email() }) });
    const { req, res, next } = mockReqResNext({ body: { email: 'not-email' } });

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('validates query params', () => {
    const mw = validate({ query: z.object({ page: z.coerce.number().min(1) }) });
    const { req, res, next } = mockReqResNext({ query: { page: '3' } as any });

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects invalid query params', () => {
    const mw = validate({ query: z.object({ page: z.coerce.number().min(1) }) });
    const { req, res, next } = mockReqResNext({ query: { page: '0' } as any });

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('validates URL params', () => {
    const mw = validate({ params: z.object({ id: z.string().uuid() }) });
    const { req, res, next } = mockReqResNext({
      params: { id: '123e4567-e89b-12d3-a456-426614174000' } as any,
    });

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('strips unknown fields from body (zod default)', () => {
    const mw = validate({ body: z.object({ name: z.string() }) });
    const { req, res, next } = mockReqResNext({ body: { name: 'test', extra: 'junk' } });

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'test' });
  });
});
