import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { db } from '../../db/index.js';
import { runWithTenantContext } from '../../db/tenant-context.js';
import { AuthorizationError, ValidationError } from '../../lib/errors.js';
import {
  createStaffReviewItem,
  getStaffReviewItem,
  listStaffReviewItems,
  sanitizeReviewMetadata,
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
        metadata: { blockingIssueCodes: ['GOOGLE_CALENDAR_INTEGRATION_MISSING'] },
      }),
    );
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
