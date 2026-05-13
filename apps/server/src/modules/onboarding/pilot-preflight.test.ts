import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenantContext } from '../../db/tenant-context.js';
import { AuthorizationError } from '../../lib/errors.js';

const mockListStaffReviewItems = vi.hoisted(() => vi.fn());
const mockComputeOnboardingReadiness = vi.hoisted(() => vi.fn());
const mockGetAppointmentReconciliationHealthSummary = vi.hoisted(() => vi.fn());
const mockScanLegacyGoogleCalendarPhi = vi.hoisted(() => vi.fn());
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));
const mockFeatures = vi.hoisted(() => ({
  appointmentReconciliationProcessor: true,
}));
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../staff-review/staff-review.service.js', () => ({
  listStaffReviewItems: mockListStaffReviewItems,
}));

vi.mock('./readiness.js', () => ({
  computeOnboardingReadiness: mockComputeOnboardingReadiness,
}));

vi.mock('../appointments/appointment-reconciliation.service.js', () => ({
  getAppointmentReconciliationHealthSummary: mockGetAppointmentReconciliationHealthSummary,
}));

vi.mock('../integrations/google-calendar-phi-scanner.js', () => ({
  scanLegacyGoogleCalendarPhi: mockScanLegacyGoogleCalendarPhi,
}));

vi.mock('../../db/index.js', () => ({
  db: mockDb,
}));

vi.mock('../../config/features.js', () => ({
  features: mockFeatures,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: mockLogger,
}));

import { assertPilotPreflightCleanForGoLive, getPilotPreflightReport } from './pilot-preflight.js';

const readyReadiness = {
  ready: true,
  blockingIssues: [],
  warnings: [],
  checkedAt: '2026-05-14T12:00:00.000Z',
};

const cleanCalendarReport = {
  totalEventsScanned: 2,
  riskyEventsCount: 0,
  riskyEvents: [],
  checkedAt: '2026-05-14T12:00:00.000Z',
};

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

function selectStatus(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function insertStatus() {
  const chain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFeatures.appointmentReconciliationProcessor = true;
  mockComputeOnboardingReadiness.mockResolvedValue(readyReadiness);
  mockListStaffReviewItems.mockResolvedValue([]);
  mockGetAppointmentReconciliationHealthSummary.mockResolvedValue({
    pendingCount: 0,
    retryingCount: 0,
    failedCount: 0,
    checkedCount: 0,
  });
  mockScanLegacyGoogleCalendarPhi.mockResolvedValue(cleanCalendarReport);
  mockDb.select.mockReturnValue(selectStatus([]));
  mockDb.insert.mockReturnValue(insertStatus());
});

describe('pilot preflight report', () => {
  it('returns ready when readiness passes and operational blockers are clean', async () => {
    const report = await withTenant('tenant-a', () =>
      getPilotPreflightReport({
        tenantId: 'tenant-a',
        calendarPhiScanReport: cleanCalendarReport,
        now: new Date('2026-05-14T12:00:00.000Z'),
      }),
    );

    expect(report.readyForSupervisedPilot).toBe(true);
    expect(report.blockingIssues).toEqual([]);
    expect(report.summary).toMatchObject({
      readinessReady: true,
      legacyCalendarPhiRiskyEvents: 0,
      openHighCriticalReviewItems: 0,
      failedReconciliations: 0,
      retryingReconciliations: 0,
      mediaStreamFailuresRecent: null,
      checkedAt: '2026-05-14T12:00:00.000Z',
    });
  });

  it('fails when readiness has blocking issues', async () => {
    mockComputeOnboardingReadiness.mockResolvedValueOnce({
      ...readyReadiness,
      ready: false,
      blockingIssues: [{ area: 'calendar', code: 'MISSING', message: 'Missing calendar.' }],
    });

    const report = await withTenant('tenant-a', () =>
      getPilotPreflightReport({ tenantId: 'tenant-a', calendarPhiScanReport: cleanCalendarReport }),
    );

    expect(report.readyForSupervisedPilot).toBe(false);
    expect(report.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'READINESS_BLOCKING_ISSUES', area: 'readiness' }),
    );
  });

  it('fails when legacy calendar PHI findings exist without exposing event details', async () => {
    const report = await withTenant('tenant-a', () =>
      getPilotPreflightReport({
        tenantId: 'tenant-a',
        calendarPhiScanReport: {
          totalEventsScanned: 1,
          riskyEventsCount: 1,
          riskyEvents: [
            {
              eventRef: 'gcal_safe_ref',
              riskCodes: ['SUMMARY_LEGACY_DETAIL'],
              recommendedAction: 'scrub_google_event',
            },
          ],
          checkedAt: '2026-05-14T12:00:00.000Z',
        },
      }),
    );

    expect(report.readyForSupervisedPilot).toBe(false);
    expect(report.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'LEGACY_CALENDAR_PHI_FOUND', area: 'calendar_phi' }),
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('Patient Jane');
    expect(serialized).not.toContain('Google event summary');
    expect(serialized).not.toContain('Google event description');
    expect(serialized).not.toContain('gcal_safe_ref');
  });

  it('fails when high or critical staff review items are open', async () => {
    mockListStaffReviewItems.mockResolvedValueOnce([
      {
        id: 'review-a',
        severity: 'critical',
        status: 'open',
        metadata: { patientName: 'Jane Secret' },
      },
    ]);

    const report = await withTenant('tenant-a', () =>
      getPilotPreflightReport({ tenantId: 'tenant-a', calendarPhiScanReport: cleanCalendarReport }),
    );

    expect(report.readyForSupervisedPilot).toBe(false);
    expect(report.summary.openHighCriticalReviewItems).toBe(1);
    expect(report.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'HIGH_CRITICAL_REVIEW_ITEMS_OPEN', area: 'staff_review' }),
    );
    expect(JSON.stringify(report)).not.toContain('Jane Secret');
  });

  it('fails on failed reconciliation and warns on retrying reconciliation', async () => {
    mockGetAppointmentReconciliationHealthSummary.mockResolvedValueOnce({
      pendingCount: 0,
      retryingCount: 2,
      failedCount: 1,
      checkedCount: 3,
    });

    const report = await withTenant('tenant-a', () =>
      getPilotPreflightReport({ tenantId: 'tenant-a', calendarPhiScanReport: cleanCalendarReport }),
    );

    expect(report.readyForSupervisedPilot).toBe(false);
    expect(report.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'RECONCILIATION_FAILED_ITEMS_OPEN',
        area: 'reconciliation',
      }),
    );
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: 'RECONCILIATION_RETRYING_ITEMS_EXIST',
        area: 'reconciliation',
      }),
    );
  });

  it('blocks when calendar PHI scan is not run and no recent persisted scan exists', async () => {
    const report = await withTenant('tenant-a', () =>
      getPilotPreflightReport({ tenantId: 'tenant-a', runCalendarPhiScan: false }),
    );

    expect(report.readyForSupervisedPilot).toBe(false);
    expect(report.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'CALENDAR_PHI_SCAN_REQUIRED', area: 'calendar_phi' }),
    );
    expect(mockScanLegacyGoogleCalendarPhi).not.toHaveBeenCalled();
  });

  it('uses a recent persisted clean calendar PHI scan when scan is not rerun', async () => {
    mockDb.select.mockReturnValueOnce(
      selectStatus([
        {
          latestCalendarPhiScanAt: new Date('2026-05-14T11:00:00.000Z'),
          latestCalendarPhiTotalEvents: 7,
          latestCalendarPhiRiskyEvents: 0,
        },
      ]),
    );

    const report = await withTenant('tenant-a', () =>
      getPilotPreflightReport({
        tenantId: 'tenant-a',
        runCalendarPhiScan: false,
        now: new Date('2026-05-14T12:00:00.000Z'),
      }),
    );

    expect(report.readyForSupervisedPilot).toBe(true);
    expect(report.summary.legacyCalendarPhiRiskyEvents).toBe(0);
    expect(report.blockingIssues).not.toContainEqual(
      expect.objectContaining({ code: 'CALENDAR_PHI_SCAN_REQUIRED' }),
    );
  });

  it('blocks when persisted calendar PHI scan is stale', async () => {
    mockDb.select.mockReturnValueOnce(
      selectStatus([
        {
          latestCalendarPhiScanAt: new Date('2026-05-01T12:00:00.000Z'),
          latestCalendarPhiTotalEvents: 7,
          latestCalendarPhiRiskyEvents: 0,
        },
      ]),
    );

    const report = await withTenant('tenant-a', () =>
      getPilotPreflightReport({
        tenantId: 'tenant-a',
        runCalendarPhiScan: false,
        now: new Date('2026-05-14T12:00:00.000Z'),
      }),
    );

    expect(report.readyForSupervisedPilot).toBe(false);
    expect(report.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'CALENDAR_PHI_SCAN_REQUIRED', area: 'calendar_phi' }),
    );
  });

  it('blocks when reconciliation processor is disabled', async () => {
    mockFeatures.appointmentReconciliationProcessor = false;

    const report = await withTenant('tenant-a', () =>
      getPilotPreflightReport({ tenantId: 'tenant-a', calendarPhiScanReport: cleanCalendarReport }),
    );

    expect(report.readyForSupervisedPilot).toBe(false);
    expect(report.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'RECONCILIATION_PROCESSOR_DISABLED', area: 'worker' }),
    );
  });

  it('runs calendar PHI scan only when explicitly requested', async () => {
    await withTenant('tenant-a', () =>
      getPilotPreflightReport({ tenantId: 'tenant-a', runCalendarPhiScan: true }),
    );

    expect(mockScanLegacyGoogleCalendarPhi).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      now: expect.any(Date),
    });
  });

  it('rejects cross-tenant preflight access', async () => {
    await expect(
      withTenant('tenant-a', () => getPilotPreflightReport({ tenantId: 'tenant-b' })),
    ).rejects.toThrow(AuthorizationError);
  });

  it('go-live guard rejects when no calendar PHI scan state exists', async () => {
    await expect(
      withTenant('tenant-a', () => assertPilotPreflightCleanForGoLive('tenant-a')),
    ).rejects.toMatchObject({
      details: {
        errors: expect.arrayContaining([
          expect.objectContaining({ code: 'PILOT_PREFLIGHT_NOT_CLEAN' }),
          expect.objectContaining({ code: 'CALENDAR_PHI_SCAN_REQUIRED' }),
        ]),
      },
    });
  });

  it('go-live guard rejects when latest calendar PHI scan has risky events', async () => {
    mockDb.select.mockReturnValueOnce(
      selectStatus([
        {
          latestCalendarPhiScanAt: new Date('2026-05-14T11:00:00.000Z'),
          latestCalendarPhiTotalEvents: 10,
          latestCalendarPhiRiskyEvents: 2,
        },
      ]),
    );

    await expect(
      withTenant('tenant-a', () => assertPilotPreflightCleanForGoLive('tenant-a')),
    ).rejects.toMatchObject({
      details: {
        errors: expect.arrayContaining([
          expect.objectContaining({ code: 'PILOT_PREFLIGHT_NOT_CLEAN' }),
          expect.objectContaining({ code: 'LEGACY_CALENDAR_PHI_FOUND' }),
        ]),
      },
    });
  });

  it('go-live guard succeeds when persisted preflight dependencies are clean', async () => {
    mockDb.select.mockReturnValueOnce(
      selectStatus([
        {
          latestCalendarPhiScanAt: new Date('2026-05-14T11:00:00.000Z'),
          latestCalendarPhiTotalEvents: 10,
          latestCalendarPhiRiskyEvents: 0,
        },
      ]),
    );

    await expect(
      withTenant('tenant-a', () => assertPilotPreflightCleanForGoLive('tenant-a')),
    ).resolves.toMatchObject({
      readyForSupervisedPilot: true,
      blockingIssues: [],
    });
  });
});
