import { logger } from '../../lib/logger.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { features } from '../../config/features.js';
import { db } from '../../db/index.js';
import { pilotPreflightStatus } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { ValidationError } from '../../lib/errors.js';
import { listStaffReviewItems } from '../staff-review/staff-review.service.js';
import {
  getAppointmentReconciliationHealthSummary,
  type AppointmentReconciliationHealthSummary,
} from '../appointments/appointment-reconciliation.service.js';
import {
  scanLegacyGoogleCalendarPhi,
  type GoogleCalendarPhiScanReport,
} from '../integrations/google-calendar-phi-scanner.js';
import { computeOnboardingReadiness } from './readiness.js';
import type { OnboardingReadinessResult } from './types.js';

type PilotPreflightArea =
  | 'readiness'
  | 'calendar_phi'
  | 'staff_review'
  | 'reconciliation'
  | 'media_stream'
  | 'worker';

export interface PilotPreflightIssue {
  code: string;
  message: string;
  area: PilotPreflightArea;
}

export interface PilotPreflightSummary {
  readinessReady: boolean;
  legacyCalendarPhiRiskyEvents: number;
  openHighCriticalReviewItems: number;
  failedReconciliations: number;
  retryingReconciliations: number;
  mediaStreamFailuresRecent: number | null;
  checkedAt: string;
}

export interface PilotPreflightReport {
  readyForSupervisedPilot: boolean;
  blockingIssues: PilotPreflightIssue[];
  warnings: PilotPreflightIssue[];
  summary: PilotPreflightSummary;
}

export interface PilotPreflightInput {
  tenantId: string;
  runCalendarPhiScan?: boolean;
  calendarPhiScanReport?: GoogleCalendarPhiScanReport | null;
  readinessResult?: OnboardingReadinessResult;
  reconciliationHealth?: AppointmentReconciliationHealthSummary;
  requirePublishedConfig?: boolean;
  now?: Date;
}

interface PersistedCalendarPhiScanStatus {
  totalEventsScanned: number;
  riskyEventsCount: number;
  checkedAt: string;
}

const PILOT_PREFLIGHT_CALENDAR_SCAN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function blocking(area: PilotPreflightArea, code: string, message: string): PilotPreflightIssue {
  return { area, code, message };
}

function warning(area: PilotPreflightArea, code: string, message: string): PilotPreflightIssue {
  return { area, code, message };
}

async function maybeRunCalendarPhiScan(
  input: PilotPreflightInput,
): Promise<GoogleCalendarPhiScanReport | null> {
  if (input.calendarPhiScanReport !== undefined) return input.calendarPhiScanReport;
  if (!input.runCalendarPhiScan) return null;
  try {
    return await scanLegacyGoogleCalendarPhi({ tenantId: input.tenantId, now: input.now });
  } catch (error) {
    logger.warn(
      {
        tenantId: input.tenantId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
      'Pilot preflight calendar PHI scan failed safely',
    );
    return null;
  }
}

function isCalendarPhiScanFresh(report: PersistedCalendarPhiScanStatus, now: Date): boolean {
  const checkedAtMs = Date.parse(report.checkedAt);
  if (!Number.isFinite(checkedAtMs)) return false;
  return now.getTime() - checkedAtMs <= PILOT_PREFLIGHT_CALENDAR_SCAN_MAX_AGE_MS;
}

async function getLatestCalendarPhiScanStatus(
  tenantId: string,
): Promise<PersistedCalendarPhiScanStatus | null> {
  const [status] = await db
    .select()
    .from(pilotPreflightStatus)
    .where(eq(pilotPreflightStatus.tenantId, tenantId))
    .limit(1);

  if (!status?.latestCalendarPhiScanAt) return null;
  return {
    totalEventsScanned: status.latestCalendarPhiTotalEvents ?? 0,
    riskyEventsCount: status.latestCalendarPhiRiskyEvents ?? 0,
    checkedAt: status.latestCalendarPhiScanAt.toISOString(),
  };
}

async function persistPilotPreflightStatus(input: {
  tenantId: string;
  checkedAt: Date;
  readyForSupervisedPilot: boolean;
  blockingIssues: PilotPreflightIssue[];
  warnings: PilotPreflightIssue[];
  calendarReport: PersistedCalendarPhiScanStatus | null;
}): Promise<void> {
  const row = {
    tenantId: input.tenantId,
    latestCalendarPhiScanAt: input.calendarReport
      ? new Date(input.calendarReport.checkedAt)
      : undefined,
    latestCalendarPhiTotalEvents: input.calendarReport?.totalEventsScanned,
    latestCalendarPhiRiskyEvents: input.calendarReport?.riskyEventsCount,
    lastPreflightCheckedAt: input.checkedAt,
    lastPreflightReady: input.readyForSupervisedPilot,
    lastBlockingIssueCodes: input.blockingIssues.map((issue) => issue.code),
    lastWarningCodes: input.warnings.map((issue) => issue.code),
    updatedAt: input.checkedAt,
  };

  await db.insert(pilotPreflightStatus).values(row).onConflictDoUpdate({
    target: pilotPreflightStatus.tenantId,
    set: row,
  });
}

export async function getPilotPreflightReport(
  input: PilotPreflightInput,
): Promise<PilotPreflightReport> {
  assertTenantAccess(input.tenantId);
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const [readiness, openReviewItems, reconciliationHealth, scannedCalendarReport] =
    await Promise.all([
      input.readinessResult ??
        computeOnboardingReadiness(input.tenantId, {
          requirePublishedConfig: input.requirePublishedConfig ?? true,
        }),
      listStaffReviewItems({ tenantId: input.tenantId, status: 'open', limit: 200 }),
      input.reconciliationHealth ??
        getAppointmentReconciliationHealthSummary({ tenantId: input.tenantId }),
      maybeRunCalendarPhiScan({ ...input, now }),
    ]);

  const persistedCalendarReport =
    scannedCalendarReport || input.calendarPhiScanReport !== undefined
      ? null
      : await getLatestCalendarPhiScanStatus(input.tenantId);
  const calendarReport = scannedCalendarReport ?? persistedCalendarReport;

  const openHighCriticalReviewItems = openReviewItems.filter(
    (item) => item.severity === 'high' || item.severity === 'critical',
  ).length;
  const legacyCalendarPhiRiskyEvents = calendarReport?.riskyEventsCount ?? 0;

  const blockingIssues: PilotPreflightIssue[] = [];
  const warnings: PilotPreflightIssue[] = [];

  if (!readiness.ready) {
    blockingIssues.push(
      blocking(
        'readiness',
        'READINESS_BLOCKING_ISSUES',
        'Onboarding readiness has blocking issues.',
      ),
    );
  }

  if (!calendarReport) {
    blockingIssues.push(
      blocking(
        'calendar_phi',
        'CALENDAR_PHI_SCAN_REQUIRED',
        'A recent legacy Google Calendar PHI scan is required before pilot go-live.',
      ),
    );
  } else if (!isCalendarPhiScanFresh(calendarReport, now)) {
    blockingIssues.push(
      blocking(
        'calendar_phi',
        'CALENDAR_PHI_SCAN_REQUIRED',
        'Legacy Google Calendar PHI scan is stale and must be rerun before pilot go-live.',
      ),
    );
  } else if (legacyCalendarPhiRiskyEvents > 0) {
    blockingIssues.push(
      blocking(
        'calendar_phi',
        'LEGACY_CALENDAR_PHI_FOUND',
        'Legacy Google Calendar events may contain PHI and need staff review before pilot go-live.',
      ),
    );
  }

  if (openHighCriticalReviewItems > 0) {
    blockingIssues.push(
      blocking(
        'staff_review',
        'HIGH_CRITICAL_REVIEW_ITEMS_OPEN',
        'High or critical staff review items are still open.',
      ),
    );
  }

  if (reconciliationHealth.failedCount > 0) {
    blockingIssues.push(
      blocking(
        'reconciliation',
        'RECONCILIATION_FAILED_ITEMS_OPEN',
        'Failed appointment reconciliation items need staff review.',
      ),
    );
  }

  if (reconciliationHealth.retryingCount > 0) {
    warnings.push(
      warning(
        'reconciliation',
        'RECONCILIATION_RETRYING_ITEMS_EXIST',
        'Some appointment reconciliation items are retrying.',
      ),
    );
  }

  if (!features.appointmentReconciliationProcessor) {
    blockingIssues.push(
      blocking(
        'worker',
        'RECONCILIATION_PROCESSOR_DISABLED',
        'Appointment reconciliation processor feature flag must be enabled before pilot go-live.',
      ),
    );
  }

  warnings.push(
    warning(
      'media_stream',
      'MEDIA_STREAM_FAILURES_RECENT',
      'Recent media-stream failure count is not available from durable tenant state.',
    ),
    warning(
      'worker',
      'WORKER_HEALTH_UNKNOWN',
      'Appointment maintenance worker health is not tracked in durable tenant state.',
    ),
  );

  const summary: PilotPreflightSummary = {
    readinessReady: readiness.ready,
    legacyCalendarPhiRiskyEvents,
    openHighCriticalReviewItems,
    failedReconciliations: reconciliationHealth.failedCount,
    retryingReconciliations: reconciliationHealth.retryingCount,
    mediaStreamFailuresRecent: null,
    checkedAt,
  };

  logger.info(
    {
      tenantId: input.tenantId,
      readyForSupervisedPilot: blockingIssues.length === 0,
      blockingIssueCodes: blockingIssues.map((issue) => issue.code),
      warningCodes: warnings.map((issue) => issue.code),
      summary,
    },
    'Pilot preflight evaluated',
  );

  await persistPilotPreflightStatus({
    tenantId: input.tenantId,
    checkedAt: now,
    readyForSupervisedPilot: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    calendarReport,
  });

  return {
    readyForSupervisedPilot: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    summary,
  };
}

export async function assertPilotPreflightCleanForGoLive(
  tenantId: string,
): Promise<PilotPreflightReport> {
  const report = await getPilotPreflightReport({
    tenantId,
    requirePublishedConfig: false,
  });

  if (!report.readyForSupervisedPilot) {
    throw new ValidationError('Pilot preflight is not clean', [
      {
        code: 'PILOT_PREFLIGHT_NOT_CLEAN',
        message: 'Pilot preflight must be clean before go-live.',
        area: 'readiness',
      },
      ...report.blockingIssues,
    ]);
  }

  return report;
}
