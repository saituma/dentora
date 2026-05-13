import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { db } from '../../db/index.js';
import { runWithTenantContext } from '../../db/tenant-context.js';
import { AuthorizationError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  createStaffReviewItem,
  createStaffReviewItemSafely,
  getDailyStaffReviewDigest,
  getStaffReviewItem,
  listHighCriticalOpenItemsNeedingNotification,
  listStaffReviewItems,
  sanitizeReviewMetadata,
  toSafeStaffReviewItemResponse,
  updateStaffReviewItemStatus,
  type StaffReviewItem,
} from './staff-review.service.js';

interface SelectChain<T> {
  from: Mock;
  where: Mock;
  orderBy: Mock;
  limit: Mock;
}

interface InsertChain<T> {
  values: Mock;
  returning: Mock;
}

interface UpdateChain<T> {
  set: Mock;
  where: Mock;
  returning: Mock;
}

interface MockDb {
  select: Mock;
  insert: Mock;
  update: Mock;
}

const mockDb = db as unknown as MockDb;

const baseItem: StaffReviewItem = {
  id: 'review-a',
  tenantId: 'tenant-a',
  type: 'readiness_failure',
  severity: 'high',
  status: 'open',
  source: 'onboarding_readiness',
  relatedAppointmentId: null,
  relatedCallSessionId: null,
  relatedPatientId: null,
  relatedExternalEventRef: null,
  reasonCode: 'READINESS_FAILED',
  message: 'Scheduling is unavailable.',
  metadata: { blockingIssueCodes: ['GOOGLE_CALENDAR_INTEGRATION_MISSING'] },
  dedupeKey: 'dedupe-a',
  assignedToUserId: null,
  resolvedByUserId: null,
  resolvedAt: null,
  resolutionNote: null,
  slaDueAt: new Date('2026-05-14T12:00:00.000Z'),
  lastNotifiedAt: null,
  createdAt: new Date('2026-05-13T12:00:00.000Z'),
  updatedAt: new Date('2026-05-13T12:00:00.000Z'),
};

function selectChain<T>(rows: T[]): SelectChain<T> {
  const chain: SelectChain<T> = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  return chain;
}

function insertChain<T>(rows: T[]): InsertChain<T> {
  const chain: InsertChain<T> = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function updateChain<T>(rows: T[]): UpdateChain<T> {
  const chain: UpdateChain<T> = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('staff review service', () => {
  it('creates a review item with safe metadata', async () => {
    mockDb.select.mockReturnValueOnce(selectChain<StaffReviewItem>([]));
    const insert = insertChain<StaffReviewItem>([baseItem]);
    mockDb.insert.mockReturnValueOnce(insert);

    const item = await withTenant('tenant-a', () =>
      createStaffReviewItem({
        tenantId: 'tenant-a',
        type: 'readiness_failure',
        severity: 'high',
        source: 'onboarding_readiness',
        reasonCode: 'READINESS_FAILED',
        message: 'Scheduling is unavailable.',
        metadata: { blockingIssueCodes: ['GOOGLE_CALENDAR_INTEGRATION_MISSING'] },
      }),
    );

    expect(item).toEqual(baseItem);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        status: 'open',
        slaDueAt: expect.any(Date),
        lastNotifiedAt: null,
        metadata: { blockingIssueCodes: ['GOOGLE_CALENDAR_INTEGRATION_MISSING'] },
      }),
    );
  });

  it('logs safe structured error when safe queue write fails', async () => {
    mockDb.select.mockImplementationOnce(() => {
      throw new Error('database unavailable with Jane Secret +15551234567 1990-01-01 secret-token');
    });

    await expect(
      withTenant('tenant-a', () =>
        createStaffReviewItemSafely({
          tenantId: 'tenant-a',
          type: 'ai_tool_safety_block',
          severity: 'high',
          source: 'ai_tool',
          reasonCode: 'TOOL_BLOCKED',
          message: 'Blocked Jane Secret at +15551234567',
          metadata: {
            patientName: 'Jane Secret',
            phoneNumber: '+15551234567',
            dateOfBirth: '1990-01-01',
            token: 'secret-token',
            rawToolParams: { phoneNumber: '+15551234567' },
          },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        type: 'ai_tool_safety_block',
        severity: 'high',
        source: 'ai_tool',
        reasonCode: 'TOOL_BLOCKED',
        errorName: 'Error',
      }),
      'Staff review queue write failed',
    );
    const serialized = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('rawToolParams');
  });

  it('sanitizes PHI-like metadata fields and values', () => {
    const sanitized = sanitizeReviewMetadata({
      phoneNumber: '+15551234567',
      dateOfBirth: '1990-01-01',
      patientName: 'Jane Secret',
      safeEventRef: 'gcal_abc123',
      nested: {
        notes: 'needs sedation',
        count: 2,
        message: 'caller at +15551234567 on 1990-01-01',
      },
    });

    expect(sanitized).toEqual({
      safeEventRef: 'gcal_abc123',
      nested: {
        count: 2,
        message: 'caller at [REDACTED] on [REDACTED]',
      },
    });
  });

  it('deduplicates repeated open review items', async () => {
    mockDb.select.mockReturnValueOnce(selectChain<StaffReviewItem>([baseItem]));

    const item = await withTenant('tenant-a', () =>
      createStaffReviewItem({
        tenantId: 'tenant-a',
        type: 'readiness_failure',
        source: 'onboarding_readiness',
        reasonCode: 'READINESS_FAILED',
        message: 'Scheduling is unavailable.',
        dedupeKey: 'dedupe-a',
      }),
    );

    expect(item).toEqual(baseItem);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('keeps list/read/update tenant-scoped', async () => {
    mockDb.select.mockReturnValueOnce(selectChain<StaffReviewItem>([baseItem]));
    await withTenant('tenant-a', () => listStaffReviewItems({ tenantId: 'tenant-a' }));

    mockDb.select.mockReturnValueOnce(selectChain<StaffReviewItem>([baseItem]));
    await withTenant('tenant-a', () =>
      getStaffReviewItem({ tenantId: 'tenant-a', id: 'review-a' }),
    );

    await expect(
      withTenant('tenant-b', () => getStaffReviewItem({ tenantId: 'tenant-a', id: 'review-a' })),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      withTenant('tenant-b', () => listStaffReviewItems({ tenantId: 'tenant-a' })),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      withTenant('tenant-b', () =>
        updateStaffReviewItemStatus({
          tenantId: 'tenant-a',
          id: 'review-a',
          status: 'in_review',
        }),
      ),
    ).rejects.toThrow(AuthorizationError);
  });

  it('returns high and critical open items needing notification', async () => {
    const dueCritical = {
      ...baseItem,
      id: 'review-critical',
      severity: 'critical' as const,
      slaDueAt: new Date('2026-05-13T10:00:00.000Z'),
    };
    const dueHigh = {
      ...baseItem,
      id: 'review-high',
      severity: 'high' as const,
      slaDueAt: new Date('2026-05-13T11:00:00.000Z'),
    };
    mockDb.select.mockReturnValueOnce(selectChain<StaffReviewItem>([dueCritical, dueHigh]));

    const items = await withTenant('tenant-a', () =>
      listHighCriticalOpenItemsNeedingNotification({
        tenantId: 'tenant-a',
        now: new Date('2026-05-13T12:00:00.000Z'),
      }),
    );

    expect(items.map((item) => item.id)).toEqual(['review-critical', 'review-high']);
  });

  it('calculates safe overdue response shape without PHI fields', () => {
    const response = toSafeStaffReviewItemResponse(
      {
        ...baseItem,
        message: 'Caller +15551234567 DOB 1990-01-01 needs review.',
        metadata: {
          patientName: 'Jane Secret',
          phoneNumber: '+15551234567',
          safeEventRef: 'gcal_safe',
          nested: { dob: '1990-01-01', count: 1 },
        },
        slaDueAt: new Date('2026-05-13T10:00:00.000Z'),
      },
      new Date('2026-05-13T12:00:00.000Z'),
    );

    expect(response).toEqual(
      expect.objectContaining({
        id: 'review-a',
        tenantId: 'tenant-a',
        safeMetadata: { safeEventRef: 'gcal_safe', nested: { count: 1 } },
        overdue: true,
      }),
    );
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
    expect(serialized).not.toContain('relatedPatientId');
    expect(serialized).not.toContain('dedupeKey');
  });

  it('returns daily digest with safe counts and item refs only', async () => {
    const now = new Date('2026-05-13T12:00:00.000Z');
    mockDb.select.mockReturnValueOnce(
      selectChain<StaffReviewItem>([
        {
          ...baseItem,
          id: 'review-overdue',
          severity: 'critical',
          slaDueAt: new Date('2026-05-13T08:00:00.000Z'),
          metadata: { patientName: 'Jane Secret' },
        },
        { ...baseItem, id: 'review-in-review', status: 'in_review' },
        { ...baseItem, id: 'review-resolved', status: 'resolved' },
      ]),
    );

    const digest = await withTenant('tenant-a', () =>
      getDailyStaffReviewDigest({ tenantId: 'tenant-a', now }),
    );

    expect(digest.totalUnresolved).toBe(2);
    expect(digest.overdueCount).toBe(1);
    expect(digest.highCriticalOpenCount).toBe(1);
    expect(digest.itemRefs.map((item) => item.id)).toEqual(['review-overdue', 'review-in-review']);
    const serialized = JSON.stringify(digest);
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('safeMetadata');
  });

  it('supports open to in_review to resolved transitions', async () => {
    const inReview = { ...baseItem, status: 'in_review' as const };
    mockDb.select.mockReturnValueOnce(selectChain<StaffReviewItem>([baseItem]));
    mockDb.update.mockReturnValueOnce(updateChain<StaffReviewItem>([inReview]));

    await withTenant('tenant-a', () =>
      updateStaffReviewItemStatus({
        tenantId: 'tenant-a',
        id: 'review-a',
        status: 'in_review',
      }),
    );

    const resolved = { ...inReview, status: 'resolved' as const };
    mockDb.select.mockReturnValueOnce(selectChain<StaffReviewItem>([inReview]));
    const update = updateChain<StaffReviewItem>([resolved]);
    mockDb.update.mockReturnValueOnce(update);

    await withTenant('tenant-a', () =>
      updateStaffReviewItemStatus({
        tenantId: 'tenant-a',
        id: 'review-a',
        status: 'resolved',
        resolvedByUserId: 'user-a',
        resolutionNote: 'Called +15551234567 about 1990-01-01',
      }),
    );

    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'resolved',
        resolvedByUserId: 'user-a',
        resolutionNote: 'Called [REDACTED] about [REDACTED]',
      }),
    );
  });

  it('rejects invalid status transitions', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain<StaffReviewItem>([{ ...baseItem, status: 'resolved' }]),
    );

    await expect(
      withTenant('tenant-a', () =>
        updateStaffReviewItemStatus({
          tenantId: 'tenant-a',
          id: 'review-a',
          status: 'in_review',
        }),
      ),
    ).rejects.toThrow(ValidationError);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
