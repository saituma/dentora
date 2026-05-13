import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { runWithTenantContext } from '../../db/tenant-context.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../lib/errors.js';

// Hoist mocks so they're available before module imports
const mockScanLegacyGoogleCalendarPhi = vi.hoisted(() => vi.fn());
const mockScrubLegacyGoogleCalendarPhi = vi.hoisted(() => vi.fn());
const mockCreateStaffReviewItemSafely = vi.hoisted(() => vi.fn());
const mockGetClinicProfile = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./google-calendar-phi-scanner.js', () => ({
  scanLegacyGoogleCalendarPhi: mockScanLegacyGoogleCalendarPhi,
  scrubLegacyGoogleCalendarPhi: mockScrubLegacyGoogleCalendarPhi,
}));

vi.mock('../staff-review/staff-review.service.js', () => ({
  createStaffReviewItemSafely: mockCreateStaffReviewItemSafely,
}));

vi.mock('../config/config.service.js', () => ({
  getClinicProfile: mockGetClinicProfile,
}));

vi.mock('../../lib/logger.js', () => ({ logger: mockLogger }));

vi.mock('../../db/index.js', () => ({ db: mockDb }));

interface SelectChain {
  from: Mock;
  where: Mock;
  orderBy: Mock;
  limit: Mock;
}

interface InsertChain {
  values: Mock;
  onConflictDoUpdate: Mock;
  returning: Mock;
}

interface UpdateChain {
  set: Mock;
  where: Mock;
  returning: Mock;
}

function selectChain(rows: unknown[]): SelectChain {
  const chain: SelectChain = {
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

function insertChain(rows: unknown[]): InsertChain {
  const chain: InsertChain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    returning: vi.fn().mockResolvedValue(rows),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function updateChain(rows: unknown[]): UpdateChain {
  const chain: UpdateChain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

import {
  startCalendarPhiRemediationDryRun,
  getLatestCalendarPhiRemediationRun,
  approveAndRunCalendarPhiScrub,
  type SafeCalendarPhiRemediationRunResponse,
} from './calendar-phi-remediation.service.js';

import type {
  GoogleCalendarPhiScanReport,
  GoogleCalendarPhiScrubResult,
} from './google-calendar-phi-scanner.js';

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

const now = new Date('2026-05-14T10:00:00.000Z');

const cleanScanReport: GoogleCalendarPhiScanReport = {
  totalEventsScanned: 20,
  riskyEventsCount: 0,
  riskyEvents: [],
  checkedAt: now.toISOString(),
};

const dirtyScanReport: GoogleCalendarPhiScanReport = {
  totalEventsScanned: 20,
  riskyEventsCount: 3,
  riskyEvents: [
    {
      eventRef: 'gcal_abc123',
      riskCodes: ['SUMMARY_LEGACY_DETAIL', 'SUMMARY_PHI_KEYWORD'],
      recommendedAction: 'scrub_google_event',
    },
    {
      eventRef: 'gcal_def456',
      riskCodes: ['PRIVATE_PHI_FIELD'],
      recommendedAction: 'scrub_google_event',
    },
    {
      eventRef: 'gcal_ghi789',
      riskCodes: ['SUMMARY_PHONE_PATTERN'],
      recommendedAction: 'scrub_google_event',
    },
  ],
  checkedAt: now.toISOString(),
};

const baseDryRunRow = {
  id: 'run-dry-1',
  tenantId: 'tenant-a',
  status: 'dry_run_completed' as const,
  mode: 'dry_run' as const,
  totalEventsScanned: 20,
  riskyEventsCount: 3,
  scrubbedEventsCount: null,
  failedScrubCount: null,
  riskCodesSummary: [
    'PRIVATE_PHI_FIELD',
    'SUMMARY_LEGACY_DETAIL',
    'SUMMARY_PHI_KEYWORD',
    'SUMMARY_PHONE_PATTERN',
  ],
  approvedByUserId: null,
  approvedAt: null,
  completedAt: now,
  failureCode: null,
  failureReasonCode: null,
  createdAt: now,
  updatedAt: now,
};

const scrubRunRow = {
  ...baseDryRunRow,
  id: 'run-scrub-1',
  status: 'scrub_running' as const,
  mode: 'confirmed_scrub' as const,
  scrubbedEventsCount: null,
  failedScrubCount: null,
  approvedByUserId: 'user-a',
  approvedAt: now,
};

const scrubResult: GoogleCalendarPhiScrubResult = {
  dryRun: false,
  totalEventsScanned: 20,
  riskyEventsCount: 3,
  riskyEvents: dirtyScanReport.riskyEvents,
  eventsScrubbed: 3,
  eventsSkipped: 0,
  checkedAt: now.toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClinicProfile.mockResolvedValue({ timezone: 'Europe/London' });
  mockCreateStaffReviewItemSafely.mockResolvedValue(undefined);
  mockScanLegacyGoogleCalendarPhi.mockResolvedValue(cleanScanReport);
  mockScrubLegacyGoogleCalendarPhi.mockResolvedValue(scrubResult);
});

describe('startCalendarPhiRemediationDryRun', () => {
  it('persists a safe dry-run record and returns a PHI-safe response', async () => {
    mockScanLegacyGoogleCalendarPhi.mockResolvedValue(dirtyScanReport);
    const insert = insertChain([baseDryRunRow]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);

    const run = await withTenant('tenant-a', () =>
      startCalendarPhiRemediationDryRun({ tenantId: 'tenant-a', now }),
    );

    expect(run.id).toBe('run-dry-1');
    expect(run.status).toBe('dry_run_completed');
    expect(run.mode).toBe('dry_run');
    expect(run.totalEventsScanned).toBe(20);
    expect(run.riskyEventsCount).toBe(3);
    expect(run.riskCodesSummary).toEqual([
      'PRIVATE_PHI_FIELD',
      'SUMMARY_LEGACY_DETAIL',
      'SUMMARY_PHI_KEYWORD',
      'SUMMARY_PHONE_PATTERN',
    ]);
    expect(run.scrubbedEventsCount).toBeNull();
    expect(run.failedScrubCount).toBeNull();
  });

  it('does NOT call scrubLegacyGoogleCalendarPhi — no Google PATCH on dry-run', async () => {
    const insert = insertChain([baseDryRunRow]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);

    await withTenant('tenant-a', () =>
      startCalendarPhiRemediationDryRun({ tenantId: 'tenant-a', now }),
    );

    expect(mockScrubLegacyGoogleCalendarPhi).not.toHaveBeenCalled();
  });

  it('response excludes raw PHI — no event details, summaries, or patient data', async () => {
    mockScanLegacyGoogleCalendarPhi.mockResolvedValue(dirtyScanReport);
    const insert = insertChain([baseDryRunRow]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);

    const run = await withTenant('tenant-a', () =>
      startCalendarPhiRemediationDryRun({ tenantId: 'tenant-a', now }),
    );

    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain('patientName');
    expect(serialized).not.toContain('summary');
    expect(serialized).not.toContain('description');
    expect(serialized).not.toContain('extendedProperties');
    expect(serialized).not.toContain('approvedByUserId');
    expect(serialized).not.toContain('failureCode');
    expect(serialized).not.toContain('failureReasonCode');
  });

  it('persists scan counts to pilotPreflightStatus — clean scan (zero risky events)', async () => {
    mockScanLegacyGoogleCalendarPhi.mockResolvedValue(cleanScanReport);
    const insert = insertChain([{ ...baseDryRunRow, riskyEventsCount: 0 }]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);

    const run = await withTenant('tenant-a', () =>
      startCalendarPhiRemediationDryRun({ tenantId: 'tenant-a', now }),
    );

    expect(preflightInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        latestCalendarPhiRiskyEvents: 0,
        latestCalendarPhiTotalEvents: 20,
      }),
    );
    expect(run.riskyEventsCount).toBe(0);
  });

  it('creates a staff review item when risky events are found', async () => {
    mockScanLegacyGoogleCalendarPhi.mockResolvedValue(dirtyScanReport);
    const insert = insertChain([baseDryRunRow]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);

    await withTenant('tenant-a', () =>
      startCalendarPhiRemediationDryRun({ tenantId: 'tenant-a', now }),
    );

    expect(mockCreateStaffReviewItemSafely).toHaveBeenCalledOnce();
    expect(mockCreateStaffReviewItemSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        type: 'legacy_calendar_phi_detected',
        severity: 'high',
        source: 'calendar_phi_scanner',
        reasonCode: 'LEGACY_GOOGLE_CALENDAR_PHI_DETECTED',
      }),
    );
    // Staff review metadata must not contain PHI
    const call = mockCreateStaffReviewItemSafely.mock.calls[0][0];
    const metaSerialized = JSON.stringify(call.metadata);
    expect(metaSerialized).not.toContain('patientName');
    expect(metaSerialized).not.toContain('summary');
    expect(metaSerialized).not.toContain('description');
    expect(metaSerialized).toContain('riskyEventsCount');
    expect(metaSerialized).toContain('riskCodesSummary');
  });

  it('does NOT create a staff review item when zero risky events', async () => {
    mockScanLegacyGoogleCalendarPhi.mockResolvedValue(cleanScanReport);
    const insert = insertChain([{ ...baseDryRunRow, riskyEventsCount: 0 }]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);

    await withTenant('tenant-a', () =>
      startCalendarPhiRemediationDryRun({ tenantId: 'tenant-a', now }),
    );

    expect(mockCreateStaffReviewItemSafely).not.toHaveBeenCalled();
  });

  it('enforces tenant isolation — cannot run for another tenant', async () => {
    await expect(
      withTenant('tenant-b', () =>
        startCalendarPhiRemediationDryRun({ tenantId: 'tenant-a', now }),
      ),
    ).rejects.toThrow(AuthorizationError);

    expect(mockScanLegacyGoogleCalendarPhi).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe('getLatestCalendarPhiRemediationRun', () => {
  it('returns the latest run as a PHI-safe response', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([baseDryRunRow]));

    const run = await withTenant('tenant-a', () =>
      getLatestCalendarPhiRemediationRun({ tenantId: 'tenant-a' }),
    );

    expect(run).not.toBeNull();
    expect(run?.id).toBe('run-dry-1');
    expect(run?.status).toBe('dry_run_completed');

    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain('approvedByUserId');
    expect(serialized).not.toContain('failureCode');
    expect(serialized).not.toContain('failureReasonCode');
  });

  it('returns null when no runs exist', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const run = await withTenant('tenant-a', () =>
      getLatestCalendarPhiRemediationRun({ tenantId: 'tenant-a' }),
    );

    expect(run).toBeNull();
  });

  it('enforces tenant isolation', async () => {
    await expect(
      withTenant('tenant-b', () => getLatestCalendarPhiRemediationRun({ tenantId: 'tenant-a' })),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('approveAndRunCalendarPhiScrub', () => {
  it('throws ValidationError when confirm is false', async () => {
    await expect(
      withTenant('tenant-a', () =>
        approveAndRunCalendarPhiScrub({
          tenantId: 'tenant-a',
          confirm: false,
          approvedByUserId: 'user-a',
          now,
        }),
      ),
    ).rejects.toThrow(ValidationError);

    expect(mockScrubLegacyGoogleCalendarPhi).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when no completed dry-run exists', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      withTenant('tenant-a', () =>
        approveAndRunCalendarPhiScrub({
          tenantId: 'tenant-a',
          confirm: true,
          approvedByUserId: 'user-a',
          now,
        }),
      ),
    ).rejects.toThrow(NotFoundError);

    expect(mockScrubLegacyGoogleCalendarPhi).not.toHaveBeenCalled();
  });

  it('calls scrubLegacyGoogleCalendarPhi with dryRun=false and confirm=true', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([baseDryRunRow]));
    const insert = insertChain([scrubRunRow]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);
    const update = updateChain([
      { ...scrubRunRow, status: 'scrub_completed', scrubbedEventsCount: 3, failedScrubCount: 0 },
    ]);
    mockDb.update.mockReturnValueOnce(update);
    // Verification scan uses scanLegacyGoogleCalendarPhi (second call)
    mockScanLegacyGoogleCalendarPhi.mockResolvedValueOnce(cleanScanReport);

    await withTenant('tenant-a', () =>
      approveAndRunCalendarPhiScrub({
        tenantId: 'tenant-a',
        confirm: true,
        approvedByUserId: 'user-a',
        now,
      }),
    );

    expect(mockScrubLegacyGoogleCalendarPhi).toHaveBeenCalledOnce();
    expect(mockScrubLegacyGoogleCalendarPhi).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false, confirm: true, tenantId: 'tenant-a' }),
    );
  });

  it('persists scrubbed and failed counts after successful scrub', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([baseDryRunRow]));
    const insert = insertChain([scrubRunRow]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);
    const completedRow = {
      ...scrubRunRow,
      status: 'scrub_completed' as const,
      scrubbedEventsCount: 3,
      failedScrubCount: 0,
    };
    const update = updateChain([completedRow]);
    mockDb.update.mockReturnValueOnce(update);
    mockScanLegacyGoogleCalendarPhi.mockResolvedValueOnce(cleanScanReport);

    const run = await withTenant('tenant-a', () =>
      approveAndRunCalendarPhiScrub({
        tenantId: 'tenant-a',
        confirm: true,
        approvedByUserId: 'user-a',
        now,
      }),
    );

    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'scrub_completed',
        scrubbedEventsCount: 3,
        failedScrubCount: 0,
      }),
    );
    expect(run.status).toBe('scrub_completed');
    expect(run.scrubbedEventsCount).toBe(3);
    expect(run.failedScrubCount).toBe(0);
  });

  it('stores safe failure code when scrub throws — no raw error message stored', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([baseDryRunRow]));
    const insert = insertChain([scrubRunRow]);
    mockDb.insert.mockReturnValueOnce(insert);
    mockScrubLegacyGoogleCalendarPhi.mockRejectedValue(
      new Error('Google API error: patient Jane Secret +15551234567'),
    );
    const failedRow = {
      ...scrubRunRow,
      status: 'scrub_failed' as const,
      failureCode: 'Error',
      failureReasonCode: 'SCRUB_EXECUTION_ERROR',
    };
    const update = updateChain([failedRow]);
    mockDb.update.mockReturnValueOnce(update);

    const run = await withTenant('tenant-a', () =>
      approveAndRunCalendarPhiScrub({
        tenantId: 'tenant-a',
        confirm: true,
        approvedByUserId: 'user-a',
        now,
      }),
    );

    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'scrub_failed',
        failureCode: 'Error',
        failureReasonCode: 'SCRUB_EXECUTION_ERROR',
      }),
    );
    expect(run.status).toBe('scrub_failed');

    // The raw error message MUST NOT appear in the response or logger calls
    const logArgs = JSON.stringify(mockLogger.error.mock.calls);
    expect(logArgs).not.toContain('Jane Secret');
    expect(logArgs).not.toContain('+15551234567');
    expect(logArgs).not.toContain('patient');
  });

  it('response does not expose raw PHI — failureCode/approvedByUserId absent from safe response', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([baseDryRunRow]));
    const insert = insertChain([scrubRunRow]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);
    const completedRow = {
      ...scrubRunRow,
      status: 'scrub_completed' as const,
      scrubbedEventsCount: 3,
      failedScrubCount: 0,
    };
    const update = updateChain([completedRow]);
    mockDb.update.mockReturnValueOnce(update);
    mockScanLegacyGoogleCalendarPhi.mockResolvedValueOnce(cleanScanReport);

    const run = await withTenant('tenant-a', () =>
      approveAndRunCalendarPhiScrub({
        tenantId: 'tenant-a',
        confirm: true,
        approvedByUserId: 'user-a',
        now,
      }),
    );

    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain('approvedByUserId');
    expect(serialized).not.toContain('failureCode');
    expect(serialized).not.toContain('failureReasonCode');
  });

  it('updates preflight scan status with verification scan after successful scrub', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([baseDryRunRow]));
    const insert = insertChain([scrubRunRow]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);
    const update = updateChain([
      {
        ...scrubRunRow,
        status: 'scrub_completed' as const,
        scrubbedEventsCount: 3,
        failedScrubCount: 0,
      },
    ]);
    mockDb.update.mockReturnValueOnce(update);
    mockScanLegacyGoogleCalendarPhi.mockResolvedValueOnce(cleanScanReport);

    await withTenant('tenant-a', () =>
      approveAndRunCalendarPhiScrub({
        tenantId: 'tenant-a',
        confirm: true,
        approvedByUserId: 'user-a',
        now,
      }),
    );

    // Verification scan should have been called once
    expect(mockScanLegacyGoogleCalendarPhi).toHaveBeenCalledOnce();
    // pilotPreflightStatus upsert should be called with verification results
    expect(preflightInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        latestCalendarPhiRiskyEvents: 0,
      }),
    );
  });

  it('preflight remains blocked — scan persists non-zero risky count when scrub incomplete', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([baseDryRunRow]));
    const insert = insertChain([scrubRunRow]);
    const preflightInsert = insertChain([]);
    mockDb.insert.mockReturnValueOnce(insert).mockReturnValueOnce(preflightInsert);
    const update = updateChain([
      {
        ...scrubRunRow,
        status: 'scrub_completed' as const,
        scrubbedEventsCount: 1,
        failedScrubCount: 2,
      },
    ]);
    mockDb.update.mockReturnValueOnce(update);
    // Verification scan still finds risky events
    mockScanLegacyGoogleCalendarPhi.mockResolvedValueOnce({
      ...dirtyScanReport,
      riskyEventsCount: 2,
    });

    await withTenant('tenant-a', () =>
      approveAndRunCalendarPhiScrub({
        tenantId: 'tenant-a',
        confirm: true,
        approvedByUserId: 'user-a',
        now,
      }),
    );

    expect(preflightInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        latestCalendarPhiRiskyEvents: 2, // still risky — preflight remains blocked
      }),
    );
  });

  it('enforces tenant isolation — cannot scrub for another tenant', async () => {
    await expect(
      withTenant('tenant-b', () =>
        approveAndRunCalendarPhiScrub({
          tenantId: 'tenant-a',
          confirm: true,
          approvedByUserId: 'user-a',
          now,
        }),
      ),
    ).rejects.toThrow(AuthorizationError);

    expect(mockScrubLegacyGoogleCalendarPhi).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
