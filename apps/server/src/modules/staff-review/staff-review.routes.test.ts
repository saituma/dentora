import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mockListStaffReviewItems = vi.hoisted(() => vi.fn());
const mockGetStaffReviewItem = vi.hoisted(() => vi.fn());
const mockUpdateStaffReviewItemStatus = vi.hoisted(() => vi.fn());
const mockAssignStaffReviewItem = vi.hoisted(() => vi.fn());
const mockListHighCriticalOpenItemsNeedingNotification = vi.hoisted(() => vi.fn());
const mockGetDailyStaffReviewDigest = vi.hoisted(() => vi.fn());

vi.mock('./staff-review.service.js', () => ({
  listStaffReviewItems: mockListStaffReviewItems,
  getStaffReviewItem: mockGetStaffReviewItem,
  updateStaffReviewItemStatus: mockUpdateStaffReviewItemStatus,
  assignStaffReviewItem: mockAssignStaffReviewItem,
  listHighCriticalOpenItemsNeedingNotification: mockListHighCriticalOpenItemsNeedingNotification,
  getDailyStaffReviewDigest: mockGetDailyStaffReviewDigest,
  toSafeStaffReviewItemResponse: (item: StaffReviewRouteItem) => ({
    id: item.id,
    tenantId: item.tenantId,
    type: item.type,
    severity: item.severity,
    status: item.status,
    source: item.source,
    reasonCode: item.reasonCode,
    message: item.message,
    relatedAppointmentId: item.relatedAppointmentId,
    relatedCallSessionId: item.relatedCallSessionId,
    relatedExternalEventRef: item.relatedExternalEventRef,
    safeMetadata: item.metadata,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    slaDueAt: item.slaDueAt,
    overdue: Boolean(item.slaDueAt && item.slaDueAt <= new Date('2026-05-13T12:00:00.000Z')),
  }),
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

interface StaffReviewRouteItem {
  id: string;
  tenantId: string;
  type: string;
  severity: string;
  status: string;
  source: string;
  reasonCode: string;
  message: string;
  metadata: Record<string, unknown>;
  relatedAppointmentId: string | null;
  relatedCallSessionId: string | null;
  relatedExternalEventRef: string | null;
  createdAt: Date;
  updatedAt: Date;
  slaDueAt: Date | null;
}

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
  function makeRouteItem(overrides: Partial<StaffReviewRouteItem> = {}): StaffReviewRouteItem {
    return {
      id: 'review-a',
      tenantId: 'tenant-a',
      type: 'readiness_failure',
      severity: 'high',
      status: 'open',
      source: 'onboarding_readiness',
      reasonCode: 'READINESS_FAILED',
      message: 'Scheduling unavailable.',
      metadata: { blockingIssueCodes: ['GOOGLE_CALENDAR_INTEGRATION_MISSING'] },
      relatedAppointmentId: null,
      relatedCallSessionId: null,
      relatedExternalEventRef: null,
      createdAt: new Date('2026-05-13T12:00:00.000Z'),
      updatedAt: new Date('2026-05-13T12:00:00.000Z'),
      slaDueAt: new Date('2026-05-13T10:00:00.000Z'),
      ...overrides,
    };
  }

  it('lists tenant-scoped review items without PHI fields', async () => {
    mockListStaffReviewItems.mockResolvedValueOnce([makeRouteItem()]);

    const response = await request('/items', { method: 'GET' });

    expect(response.statusCode).toBe(200);
    expect(mockListStaffReviewItems).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      status: undefined,
      severity: undefined,
      type: undefined,
      source: undefined,
      limit: undefined,
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
  });

  it('passes list filters through the tenant-scoped service', async () => {
    mockListStaffReviewItems.mockResolvedValueOnce([makeRouteItem()]);

    await request('/items', {
      method: 'GET',
      query: {
        status: 'open',
        severity: 'critical',
        type: 'legacy_calendar_phi_detected',
        source: 'calendar_phi_scanner',
        limit: '25',
      },
    });

    expect(mockListStaffReviewItems).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      status: 'open',
      severity: 'critical',
      type: 'legacy_calendar_phi_detected',
      source: 'calendar_phi_scanner',
      limit: 25,
    });
  });

  it('gets one safe item detail', async () => {
    mockGetStaffReviewItem.mockResolvedValueOnce(makeRouteItem({ id: 'review-detail' }));

    const response = await request('/items/review-detail', { method: 'GET' });

    expect(response.statusCode).toBe(200);
    expect(mockGetStaffReviewItem).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      id: 'review-detail',
    });
    expect(JSON.stringify(response.body)).not.toContain('relatedPatientId');
  });

  it('updates review item status through the tenant-scoped service', async () => {
    mockUpdateStaffReviewItemStatus.mockResolvedValueOnce(
      makeRouteItem({ status: 'resolved', message: 'Resolved.' }),
    );

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

  it('returns high and critical alert items with overdue summary', async () => {
    mockListHighCriticalOpenItemsNeedingNotification.mockResolvedValueOnce([
      makeRouteItem({ id: 'review-alert', severity: 'critical' }),
    ]);

    const response = await request('/alerts/due', { method: 'GET', query: { limit: '10' } });

    expect(response.statusCode).toBe(200);
    expect(mockListHighCriticalOpenItemsNeedingNotification).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      limit: 10,
      now: expect.any(Date),
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({ count: 1, overdueCount: 1 }),
      }),
    );
  });

  it('returns daily digest from the safe digest service', async () => {
    mockGetDailyStaffReviewDigest.mockResolvedValueOnce({
      checkedAt: '2026-05-13T12:00:00.000Z',
      totalUnresolved: 1,
      overdueCount: 1,
      highCriticalOpenCount: 1,
      countsBySeverity: { low: 0, medium: 0, high: 1, critical: 0 },
      countsByStatus: { open: 1, in_review: 0, resolved: 0, ignored: 0 },
      countsByType: { readiness_failure: 1 },
      countsBySource: { onboarding_readiness: 1 },
      itemRefs: [
        {
          id: 'review-a',
          type: 'readiness_failure',
          severity: 'high',
          status: 'open',
          source: 'onboarding_readiness',
          reasonCode: 'READINESS_FAILED',
          createdAt: new Date('2026-05-13T12:00:00.000Z'),
          slaDueAt: new Date('2026-05-13T10:00:00.000Z'),
          overdue: true,
        },
      ],
    });

    const response = await request('/digest/daily', { method: 'GET', query: { limit: '50' } });

    expect(response.statusCode).toBe(200);
    expect(mockGetDailyStaffReviewDigest).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      limit: 50,
    });
    expect(JSON.stringify(response.body)).not.toContain('safeMetadata');
  });

  it('assigns a review item when requested', async () => {
    mockAssignStaffReviewItem.mockResolvedValueOnce(makeRouteItem());

    const response = await request('/items/review-a/assignment', {
      method: 'PATCH',
      body: { assignedToUserId: '11111111-1111-4111-8111-111111111111' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockAssignStaffReviewItem).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      id: 'review-a',
      assignedToUserId: '11111111-1111-4111-8111-111111111111',
    });
  });
});
