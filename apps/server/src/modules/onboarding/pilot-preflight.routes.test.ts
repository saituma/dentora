import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mockGetPilotPreflightReport = vi.hoisted(() => vi.fn());

vi.mock('./onboarding.service.js', () => ({
  getPilotPreflightReport: mockGetPilotPreflightReport,
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
        requestedAt: '2026-05-14T12:00:00.000Z',
      };
      next();
    },
    apiRateLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { onboardingRouter } from './onboarding.routes.js';

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

async function request(path: string, query: Record<string, unknown> = {}): Promise<RouterResponse> {
  return await new Promise((resolve) => {
    const req = {
      method: 'GET',
      url: path,
      originalUrl: path,
      path,
      headers: {},
      ip: '127.0.0.1',
      body: {},
      query,
      params: {},
      audit: vi.fn(),
    } as unknown as Request;

    const res: FakeResponse = {
      statusCode: 200,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        resolve({ statusCode: this.statusCode, body });
        return this;
      },
    };

    (
      onboardingRouter as unknown as {
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

describe('pilot preflight route', () => {
  it('uses authenticated tenant context and safe response shape', async () => {
    mockGetPilotPreflightReport.mockResolvedValueOnce({
      readyForSupervisedPilot: true,
      blockingIssues: [],
      warnings: [],
      summary: {
        readinessReady: true,
        legacyCalendarPhiRiskyEvents: 0,
        openHighCriticalReviewItems: 0,
        failedReconciliations: 0,
        retryingReconciliations: 0,
        mediaStreamFailuresRecent: null,
        checkedAt: '2026-05-14T12:00:00.000Z',
      },
    });

    const response = await request('/pilot-preflight', { runCalendarPhiScan: 'true' });

    expect(response.statusCode).toBe(200);
    expect(mockGetPilotPreflightReport).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      runCalendarPhiScan: true,
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
    expect(serialized).not.toContain('token');
  });
});
