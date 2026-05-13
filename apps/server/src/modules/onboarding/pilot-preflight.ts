import { logger } from '../../lib/logger.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { features } from '../../config/features.js';
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
  now?: Date;
}

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

export async function getPilotPreflightReport(
  input: PilotPreflightInput,
): Promise<PilotPreflightReport> {
  assertTenantAccess(input.tenantId);
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const [readiness, openReviewItems, reconciliationHealth, calendarReport] = await Promise.all([
    input.readinessResult ??
      computeOnboardingReadiness(input.tenantId, { requirePublishedConfig: true }),
    listStaffReviewItems({ tenantId: input.tenantId, status: 'open', limit: 200 }),
    input.reconciliationHealth ??
      getAppointmentReconciliationHealthSummary({ tenantId: input.tenantId }),
    maybeRunCalendarPhiScan({ ...input, now }),
  ]);

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
    warnings.push(
      warning(
        'calendar_phi',
        'CALENDAR_PHI_SCAN_NOT_RUN',
        'Legacy Google Calendar PHI scan has not been run for this preflight.',
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
    warnings.push(
      warning(
        'worker',
        'RECONCILIATION_PROCESSOR_DISABLED',
        'Appointment reconciliation processor feature flag is disabled.',
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

  return {
    readyForSupervisedPilot: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    summary,
  };
}
