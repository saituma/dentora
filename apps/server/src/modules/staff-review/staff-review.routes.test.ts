import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mockListStaffReviewItems = vi.hoisted(() => vi.fn());
const mockGetStaffReviewItem = vi.hoisted(() => vi.fn());
const mockUpdateStaffReviewItemStatus = vi.hoisted(() => vi.fn());

vi.mock('./staff-review.service.js', () => ({
  listStaffReviewItems: mockListStaffReviewItems,
  getStaffReviewItem: mockGetStaffReviewItem,
  updateStaffReviewItemStatus: mockUpdateStaffReviewItemStatus,
}));

vi.mock('../../middleware/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../middleware/validate.js')>(
    '../../middleware/validate.js',
  );
  return {
    validate: actual.validate,
    authenticateJwt: (req: Request, _res: Response, next: NextFunction) => {
      req.user = { userId: 'user-a', role: 'admin', tenantId: 'tenant-a' };
      next();
    },
    resolveTenant: (req: Request, _res: Response, next: NextFunction) => {
      req.tenantContext = {
        tenantId: 'tenant-a',
        clinicSlug: 'clinic-a',
        status: 'active',
        activeConfigVersion: 1,
        resolvedVia: 'jwt',
        correlationId: 'correlation-a',
        requestedAt: '2026-05-13T12:00:00.000Z',
      };
      next();
    },
    rateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

import { staffReviewRouter } from './staff-review.routes.js';

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

async function request(
  path: string,
  input: {
    method: string;
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
  },
): Promise<RouterResponse> {
  return await new Promise((resolve) => {
    const req = {
      method: input.method,
      url: path,
      originalUrl: path,
      path,
      headers: {},
      ip: '127.0.0.1',
      body: input.body ?? {},
      query: input.query ?? {},
      params: {},
      audit: vi.fn(),
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
      body: undefined,
    };

    (
      staffReviewRouter as unknown as {
        handle: (req: Request, res: Response, next: NextFunction) => void;
      }
    ).handle(
      req,
      res as unknown as Response,
      ((err?: unknown) => {
        if (err) {
          resolve({ statusCode: 500, body: err });
          return;
        }
        resolve({ statusCode: res.statusCode, body: undefined });
      }) as NextFunction,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('staff review routes', () => {
  it('lists tenant-scoped review items without PHI fields', async () => {
    mockListStaffReviewItems.mockResolvedValueOnce([
      {
        id: 'review-a',
        tenantId: 'tenant-a',
        type: 'readiness_failure',
        severity: 'high',
        status: 'open',
        source: 'onboarding_readiness',
        reasonCode: 'READINESS_FAILED',
        message: 'Scheduling unavailable.',
        metadata: { blockingIssueCodes: ['GOOGLE_CALENDAR_INTEGRATION_MISSING'] },
      },
    ]);

    const response = await request('/items', { method: 'GET' });

    expect(response.statusCode).toBe(200);
    expect(mockListStaffReviewItems).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      status: undefined,
      limit: undefined,
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
  });

  it('updates review item status through the tenant-scoped service', async () => {
    mockUpdateStaffReviewItemStatus.mockResolvedValueOnce({
      id: 'review-a',
      tenantId: 'tenant-a',
      status: 'resolved',
      resolutionNote: 'Called [REDACTED]',
    });

    const response = await request('/items/review-a/status', {
      method: 'PATCH',
      body: { status: 'resolved', resolutionNote: 'Called +15551234567' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockUpdateStaffReviewItemStatus).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      id: 'review-a',
      status: 'resolved',
      resolvedByUserId: 'user-a',
      resolutionNote: 'Called +15551234567',
    });
  });
});
