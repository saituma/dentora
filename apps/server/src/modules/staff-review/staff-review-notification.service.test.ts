import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenantContext } from '../../db/tenant-context.js';
import {
  buildAlertPayload,
  sendStaffReviewAlerts,
  sendStaffReviewDailyDigest,
  type StaffReviewNotificationPayload,
} from './staff-review-notification.service.js';
import type { StaffReviewItem, StaffReviewDailyDigest } from './staff-review.service.js';

vi.mock('../../lib/mailer.js', () => ({
  isEmailConfigured: vi.fn(() => true),
  sendEmail: vi.fn(),
}));

vi.mock('../../lib/metrics.js', () => ({
  staffReviewNotificationsTotal: {
    labels: vi.fn(() => ({ inc: vi.fn() })),
  },
  staffReviewQueueWriteFailuresTotal: {
    labels: vi.fn(() => ({ inc: vi.fn() })),
  },
}));

vi.mock('./staff-review.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./staff-review.service.js')>();
  return {
    ...actual,
    listItemsNeedingAlerts: vi.fn(),
    markItemNotified: vi.fn(),
    getDailyStaffReviewDigest: vi.fn(),
  };
});

import { isEmailConfigured, sendEmail } from '../../lib/mailer.js';
import {
  listItemsNeedingAlerts,
  markItemNotified,
  getDailyStaffReviewDigest,
  NOTIFICATION_COOLDOWN_MS,
} from './staff-review.service.js';

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

const now = new Date('2026-05-14T10:00:00.000Z');

const baseItem: StaffReviewItem = {
  id: 'review-1',
  tenantId: 'tenant-a',
  type: 'booking_failure',
  severity: 'high',
  status: 'open',
  source: 'ai_tool',
  relatedAppointmentId: null,
  relatedCallSessionId: null,
  relatedPatientId: null,
  relatedExternalEventRef: null,
  reasonCode: 'BOOKING_FAILED',
  message: 'Booking failed for patient.',
  metadata: { blockCode: 'SLOT_UNAVAILABLE' },
  dedupeKey: 'dedupe-1',
  assignedToUserId: null,
  resolvedByUserId: null,
  resolvedAt: null,
  resolutionNote: null,
  slaDueAt: new Date('2026-05-15T10:00:00.000Z'),
  lastNotifiedAt: null,
  createdAt: new Date('2026-05-14T08:00:00.000Z'),
  updatedAt: new Date('2026-05-14T08:00:00.000Z'),
};

const overdueItem: StaffReviewItem = {
  ...baseItem,
  id: 'review-overdue',
  severity: 'medium',
  slaDueAt: new Date('2026-05-14T06:00:00.000Z'), // past now
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isEmailConfigured).mockReturnValue(true);
  vi.mocked(sendEmail).mockResolvedValue(undefined);
  vi.mocked(markItemNotified).mockResolvedValue(undefined);
});

describe('buildAlertPayload', () => {
  it('returns only PHI-safe fields for a high-severity item', () => {
    const payload = buildAlertPayload(baseItem, 'https://app.example.com/staff-review', now);

    expect(payload).toEqual<StaffReviewNotificationPayload>({
      id: 'review-1',
      type: 'booking_failure',
      severity: 'high',
      status: 'open',
      source: 'ai_tool',
      reasonCode: 'BOOKING_FAILED',
      createdAt: '2026-05-14T08:00:00.000Z',
      slaDueAt: '2026-05-15T10:00:00.000Z',
      overdue: false,
      dashboardUrl: 'https://app.example.com/staff-review',
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('patientId');
    expect(serialized).not.toContain('relatedPatient');
    expect(serialized).not.toContain('callSession');
    expect(serialized).not.toContain('message');
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('dedupeKey');
    expect(serialized).not.toContain('assignedToUserId');
    expect(serialized).not.toContain('resolvedByUserId');
    expect(serialized).not.toContain('resolutionNote');
  });

  it('marks overdue correctly and returns PHI-safe fields for overdue item', () => {
    const payload = buildAlertPayload(overdueItem, 'https://app.example.com/staff-review', now);

    expect(payload.overdue).toBe(true);
    expect(payload.severity).toBe('medium');

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('patientId');
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('message');
    expect(serialized).not.toContain('dedupeKey');
  });

  it('does not include patient name, phone, DOB, notes, or raw metadata', () => {
    const itemWithSensitiveMetadata: StaffReviewItem = {
      ...baseItem,
      metadata: {
        patientName: 'Jane Secret',
        phoneNumber: '+15551234567',
        dob: '1990-01-01',
        notes: 'needs sedation',
        token: 'secret-token',
        rawToolParams: { phone: '+15551234567' },
      },
    };
    const payload = buildAlertPayload(
      itemWithSensitiveMetadata,
      'https://app.example.com/staff-review',
      now,
    );

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('rawToolParams');
    expect(serialized).not.toContain('metadata');
  });
});

describe('sendStaffReviewAlerts', () => {
  it('sends email and marks all items notified after success', async () => {
    vi.mocked(listItemsNeedingAlerts).mockResolvedValue([baseItem, overdueItem]);

    const result = await withTenant('tenant-a', () =>
      sendStaffReviewAlerts({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
        now,
      }),
    );

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(markItemNotified).toHaveBeenCalledTimes(2);
    expect(markItemNotified).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', id: 'review-1', notifiedAt: now }),
    );
    expect(markItemNotified).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', id: 'review-overdue', notifiedAt: now }),
    );
    expect(result.notified).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('does NOT mark items notified when email send fails', async () => {
    vi.mocked(listItemsNeedingAlerts).mockResolvedValue([baseItem]);
    vi.mocked(sendEmail).mockRejectedValue(new Error('SMTP error'));

    const result = await withTenant('tenant-a', () =>
      sendStaffReviewAlerts({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
        now,
      }),
    );

    expect(markItemNotified).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('returns 0 notified and skips email when no items need alerts', async () => {
    vi.mocked(listItemsNeedingAlerts).mockResolvedValue([]);

    const result = await withTenant('tenant-a', () =>
      sendStaffReviewAlerts({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
        now,
      }),
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(markItemNotified).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('skips send and marks nothing when email is not configured', async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(false);
    vi.mocked(listItemsNeedingAlerts).mockResolvedValue([baseItem]);

    const result = await withTenant('tenant-a', () =>
      sendStaffReviewAlerts({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
        now,
      }),
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(markItemNotified).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
  });

  it('email content contains no patient name, phone, DOB, notes, or raw metadata', async () => {
    const itemWithPii: StaffReviewItem = {
      ...baseItem,
      message: 'Patient Jane Secret +15551234567 needs review.',
      metadata: {
        patientName: 'Jane Secret',
        phoneNumber: '+15551234567',
        dob: '1990-01-01',
        rawToolParams: { phone: '+15551234567' },
      },
    };
    vi.mocked(listItemsNeedingAlerts).mockResolvedValue([itemWithPii]);

    await withTenant('tenant-a', () =>
      sendStaffReviewAlerts({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
        now,
      }),
    );

    expect(sendEmail).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(sendEmail).mock.calls[0][0];
    const serialized = JSON.stringify(callArgs);
    expect(serialized).not.toContain('Jane Secret');
    expect(serialized).not.toContain('+15551234567');
    expect(serialized).not.toContain('1990-01-01');
    expect(serialized).not.toContain('rawToolParams');
    expect(serialized).not.toContain('metadata');
  });

  it('uses listItemsNeedingAlerts with the provided cooldownMs', async () => {
    vi.mocked(listItemsNeedingAlerts).mockResolvedValue([]);

    await withTenant('tenant-a', () =>
      sendStaffReviewAlerts({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
        cooldownMs: 2 * 60 * 60 * 1000,
        now,
      }),
    );

    expect(listItemsNeedingAlerts).toHaveBeenCalledWith(
      expect.objectContaining({ cooldownMs: 2 * 60 * 60 * 1000 }),
    );
  });

  it('threads tenantId to all service calls — tenant A data cannot leak to tenant B', async () => {
    vi.mocked(listItemsNeedingAlerts).mockResolvedValue([baseItem]);

    await withTenant('tenant-a', () =>
      sendStaffReviewAlerts({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
        now,
      }),
    );

    expect(listItemsNeedingAlerts).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
    expect(markItemNotified).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
  });
});

describe('sendStaffReviewDailyDigest', () => {
  const digest: StaffReviewDailyDigest = {
    checkedAt: now.toISOString(),
    totalUnresolved: 5,
    overdueCount: 2,
    highCriticalOpenCount: 3,
    countsBySeverity: { low: 0, medium: 2, high: 2, critical: 1 },
    countsByStatus: { open: 4, in_review: 1, resolved: 0, ignored: 0 },
    countsByType: { booking_failure: 3, reconciliation_failed: 2 },
    countsBySource: { ai_tool: 3, appointment_reconciliation: 2 },
    itemRefs: [
      {
        id: 'ref-1',
        type: 'booking_failure',
        severity: 'high',
        status: 'open',
        source: 'ai_tool',
        reasonCode: 'BOOKING_FAILED',
        createdAt: new Date('2026-05-14T08:00:00.000Z'),
        slaDueAt: new Date('2026-05-15T08:00:00.000Z'),
        overdue: false,
      },
    ],
  };

  it('sends digest email with counts only — no PHI in email content', async () => {
    vi.mocked(getDailyStaffReviewDigest).mockResolvedValue(digest);

    await withTenant('tenant-a', () =>
      sendStaffReviewDailyDigest({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
      }),
    );

    expect(sendEmail).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(sendEmail).mock.calls[0][0];
    const serialized = JSON.stringify(callArgs);

    // Must include counts
    expect(serialized).toContain('5'); // totalUnresolved
    expect(serialized).toContain('2'); // overdueCount
    expect(serialized).toContain('3'); // highCriticalOpenCount

    // Must NOT include patient data or raw item details
    expect(serialized).not.toContain('patientId');
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('message');
    expect(serialized).not.toContain('dedupeKey');
    expect(serialized).not.toContain('relatedPatient');
  });

  it('skips email when all items are resolved and no overdue', async () => {
    vi.mocked(getDailyStaffReviewDigest).mockResolvedValue({
      ...digest,
      totalUnresolved: 0,
      overdueCount: 0,
    });

    await withTenant('tenant-a', () =>
      sendStaffReviewDailyDigest({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
      }),
    );

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips send when email is not configured', async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(false);
    vi.mocked(getDailyStaffReviewDigest).mockResolvedValue(digest);

    await withTenant('tenant-a', () =>
      sendStaffReviewDailyDigest({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
      }),
    );

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('threads tenantId to getDailyStaffReviewDigest — tenant A data cannot appear in tenant B digest', async () => {
    vi.mocked(getDailyStaffReviewDigest).mockResolvedValue(digest);

    await withTenant('tenant-a', () =>
      sendStaffReviewDailyDigest({
        tenantId: 'tenant-a',
        staffEmail: 'staff@clinic.com',
        dashboardUrl: 'https://app.example.com/staff-review',
      }),
    );

    expect(getDailyStaffReviewDigest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
  });
});

describe('NOTIFICATION_COOLDOWN_MS constant', () => {
  it('is 4 hours', () => {
    expect(NOTIFICATION_COOLDOWN_MS).toBe(4 * 60 * 60 * 1000);
  });
});
