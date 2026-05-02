import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { tenantFromJwt, tenantFromPhoneNumber, requireTenantContext } from './tenant.js';
import { TenantNotFoundError } from '../lib/errors.js';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ db: mockDb }));
vi.mock('../db/schema.js', () => ({
  tenantRegistry: { id: 'id', clinicSlug: 'clinicSlug', status: 'status' },
  twilioNumbers: { tenantId: 'tenantId', phoneNumber: 'phoneNumber', status: 'status' },
  tenantActiveConfig: { tenantId: 'tenantId', activeVersion: 'activeVersion' },
}));
vi.mock('../config/features.js', () => ({
  features: { databaseRls: false },
}));

function mockReqResNext(overrides: Partial<Request> = {}) {
  const req = { headers: {}, body: {}, ...overrides } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn();
  return { req, res, next };
}

function chainable(result: any) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result === undefined ? [] : [result]);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tenantFromJwt', () => {
  it('calls next with TenantNotFoundError when no tenantId in JWT', () => {
    const { req, res, next } = mockReqResNext({ user: { userId: 'u1', role: 'admin' } } as any);

    tenantFromJwt(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(TenantNotFoundError));
  });

  it('resolves tenant context for valid JWT tenantId', async () => {
    const { req, res, next } = mockReqResNext({
      user: { userId: 'u1', tenantId: 't1', role: 'admin' },
    } as any);

    const fakeTenant = { tenantId: 't1', clinicSlug: 'my-clinic', status: 'active' };
    mockDb.select
      .mockReturnValueOnce(chainable(fakeTenant))
      .mockReturnValueOnce(chainable(undefined));

    tenantFromJwt(req, res, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith();
    });

    expect(req.tenantContext).toBeDefined();
    expect(req.tenantContext!.tenantId).toBe('t1');
    expect(req.tenantContext!.resolvedVia).toBe('jwt');
  });
});

describe('tenantFromPhoneNumber', () => {
  it('calls next with error when no phone number in body', () => {
    const { req, res, next } = mockReqResNext({ body: {} });

    tenantFromPhoneNumber(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(TenantNotFoundError));
  });
});

describe('requireTenantContext', () => {
  it('returns context when present', () => {
    const ctx = {
      tenantId: 't1',
      clinicSlug: 'slug',
      status: 'active' as const,
      activeConfigVersion: 1,
      resolvedVia: 'jwt' as const,
      correlationId: 'corr_abc',
      requestedAt: new Date().toISOString(),
    };
    const req = { tenantContext: ctx } as unknown as Request;

    expect(requireTenantContext(req)).toBe(ctx);
  });

  it('throws TenantNotFoundError when missing', () => {
    const req = {} as unknown as Request;
    expect(() => requireTenantContext(req)).toThrow(TenantNotFoundError);
  });
});
