import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { AuthenticationError, AuthorizationError } from '../../lib/errors.js';

const mockTenantService = vi.hoisted(() => ({
  createTenant: vi.fn(),
  getTenantById: vi.fn(),
  getTenantConfig: vi.fn(),
  listTenants: vi.fn(),
  updateTenantStatus: vi.fn(),
}));

vi.mock('./tenant.service.js', () => mockTenantService);
vi.mock('../../middleware/rateLimit.js', () => ({
  apiRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../middleware/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../middleware/validate.js')>('../../middleware/validate.js');
  return {
    validate: actual.validate,
    authenticateJwt: (req: Request, _res: unknown, next: NextFunction) => {
      const role = req.headers['x-test-role'];
      const tenantId = req.headers['x-test-tenant-id'];

      if (typeof role !== 'string' || typeof tenantId !== 'string') {
        next(new AuthenticationError('Missing test auth'));
        return;
      }

      req.user = { userId: 'u1', role, tenantId };
      next();
    },
    requirePlatformAdmin: (req: Request, _res: unknown, next: NextFunction) => {
      if (req.user?.role !== 'platform_admin') {
        next(new AuthorizationError('Platform admin required'));
        return;
      }
      next();
    },
  };
});

import { tenantRouter } from './tenant.routes.js';

interface RouterResponse {
  statusCode: number;
  body: unknown;
}

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status(this: FakeResponse, code: number): FakeResponse;
  json(this: FakeResponse, body: unknown): FakeResponse;
}

async function request(path: string, input: {
  method: string;
  headers?: Record<string, string>;
}): Promise<RouterResponse> {
  return await new Promise((resolve) => {
    const req = {
      method: input.method,
      url: path,
      originalUrl: path,
      path,
      headers: input.headers ?? {},
      ip: '127.0.0.1',
      body: {},
      query: {},
      params: {},
    } as unknown as Request;

    const res: FakeResponse = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        resolve({ statusCode: this.statusCode, body });
        return this;
      },
      body: undefined as unknown,
    };

    (tenantRouter as unknown as { handle: (req: Request, res: Response, next: NextFunction) => void }).handle(
      req,
      res as unknown as Response,
      ((err?: unknown) => {
        if (err) {
          const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 500;
          resolve({ statusCode: Number.isFinite(statusCode) ? statusCode : 500, body: err });
          return;
        }
        resolve({ statusCode: res.statusCode, body: undefined });
      }) as NextFunction,
    );
  });
}

function authHeaders(role: string, tenantId: string): Record<string, string> {
  return {
    'x-test-role': role,
    'x-test-tenant-id': tenantId,
  };
}

describe('tenant route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantService.getTenantById.mockResolvedValue({ id: 't2', clinicName: 'Tenant Two' });
    mockTenantService.getTenantConfig.mockResolvedValue({ tenantId: 't2', version: 1 });
  });

  it('allows platform admin to access tenant detail', async () => {
    const response = await request('/t2', {
      method: 'GET',
      headers: authHeaders('platform_admin', 'platform-tenant'),
    });

    expect(response.statusCode).toBe(200);
    expect(mockTenantService.getTenantById).toHaveBeenCalledWith('t2');
    expect(response.body).toEqual({ id: 't2', clinicName: 'Tenant Two' });
  });

  it('allows platform admin to access tenant config', async () => {
    const response = await request('/t2/config', {
      method: 'GET',
      headers: authHeaders('platform_admin', 'platform-tenant'),
    });

    expect(response.statusCode).toBe(200);
    expect(mockTenantService.getTenantConfig).toHaveBeenCalledWith('t2');
    expect(response.body).toEqual({ tenantId: 't2', version: 1 });
  });

  it.each([
    { path: '/t1', service: mockTenantService.getTenantById },
    { path: '/t1/config', service: mockTenantService.getTenantConfig },
  ])('allows tenant user to access matching tenantId at $path', async ({ path, service }) => {
    const response = await request(path, {
      method: 'GET',
      headers: authHeaders('admin', 't1'),
    });

    expect(response.statusCode).toBe(200);
    expect(service).toHaveBeenCalledWith('t1');
  });

  it.each([
    { path: '/t2', service: mockTenantService.getTenantById },
    { path: '/t2/config', service: mockTenantService.getTenantConfig },
  ])('rejects tenant user access to another tenantId at $path', async ({ path, service }) => {
    const response = await request(path, {
      method: 'GET',
      headers: authHeaders('admin', 't1'),
    });

    expect(response.statusCode).toBe(403);
    expect(service).not.toHaveBeenCalled();
    expect(response.body).toBeInstanceOf(AuthorizationError);
  });

  it.each(['/t1', '/t1/config'])('rejects unauthenticated request to %s', async (path) => {
    const response = await request(path, { method: 'GET' });

    expect(response.statusCode).toBe(401);
    expect(mockTenantService.getTenantById).not.toHaveBeenCalled();
    expect(mockTenantService.getTenantConfig).not.toHaveBeenCalled();
    expect(response.body).toBeInstanceOf(AuthenticationError);
  });
});
