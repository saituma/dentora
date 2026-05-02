import { describe, it, expect } from 'vitest';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  TenantNotFoundError,
  TenantSuspendedError,
  TenantArchivedError,
} from './errors.js';

describe('AppError', () => {
  it('sets all fields correctly', () => {
    const err = new AppError('boom', 500, 'BOOM', false, { key: 'val' });
    expect(err.message).toBe('boom');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('BOOM');
    expect(err.isOperational).toBe(false);
    expect(err.context).toEqual({ key: 'val' });
    expect(err.details).toEqual({ key: 'val' });
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults to operational', () => {
    const err = new AppError('ok', 400, 'OK');
    expect(err.isOperational).toBe(true);
  });
});

describe('AuthenticationError', () => {
  it('has 401 status', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_REQUIRED');
  });
});

describe('AuthorizationError', () => {
  it('has 403 status', () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});

describe('ValidationError', () => {
  it('has 422 status and holds errors array', () => {
    const err = new ValidationError('bad input', [{ field: 'email' }]);
    expect(err.statusCode).toBe(422);
    expect(err.context.errors).toEqual([{ field: 'email' }]);
  });
});

describe('ConflictError', () => {
  it('has 409 status', () => {
    const err = new ConflictError('duplicate');
    expect(err.statusCode).toBe(409);
  });
});

describe('NotFoundError', () => {
  it('has 404 status and entity name', () => {
    const err = new NotFoundError('User', '123');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('User not found');
    expect(err.context).toEqual({ entity: 'User', id: '123' });
  });
});

describe('RateLimitError', () => {
  it('has 429 status and retryAfterSeconds', () => {
    const err = new RateLimitError(60);
    expect(err.statusCode).toBe(429);
    expect(err.context.retryAfterSeconds).toBe(60);
  });
});

describe('TenantNotFoundError', () => {
  it('has 404 status', () => {
    const err = new TenantNotFoundError('abc', 'jwt');
    expect(err.statusCode).toBe(404);
    expect(err.context.method).toBe('jwt');
  });
});

describe('TenantSuspendedError', () => {
  it('has 403 status', () => {
    const err = new TenantSuspendedError('t1');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('TENANT_SUSPENDED');
  });
});

describe('TenantArchivedError', () => {
  it('has 410 status', () => {
    const err = new TenantArchivedError('t1');
    expect(err.statusCode).toBe(410);
    expect(err.code).toBe('TENANT_ARCHIVED');
  });
});
