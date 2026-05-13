import { and, desc, eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { calendarPhiRemediationRuns, pilotPreflightStatus } from '../../db/schema.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { getClinicProfile } from '../config/config.service.js';
import { createStaffReviewItemSafely } from '../staff-review/staff-review.service.js';
import {
  scanLegacyGoogleCalendarPhi,
  scrubLegacyGoogleCalendarPhi,
  type GoogleCalendarPhiRiskCode,
  type GoogleCalendarPhiScanReport,
} from './google-calendar-phi-scanner.js';

type CalendarPhiRemediationRun = InferSelectModel<typeof calendarPhiRemediationRuns>;
type CalendarPhiRemediationRunStatus = CalendarPhiRemediationRun['status'];
type CalendarPhiRemediationRunMode = CalendarPhiRemediationRun['mode'];

export interface SafeCalendarPhiRemediationRunResponse {
  id: string;
  status: CalendarPhiRemediationRunStatus;
  mode: CalendarPhiRemediationRunMode;
  totalEventsScanned: number;
  riskyEventsCount: number;
  scrubbedEventsCount: number | null;
  failedScrubCount: number | null;
  riskCodesSummary: GoogleCalendarPhiRiskCode[];
  approvedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSafeRunResponse(run: CalendarPhiRemediationRun): SafeCalendarPhiRemediationRunResponse {
  return {
    id: run.id,
    status: run.status,
    mode: run.mode,
    totalEventsScanned: run.totalEventsScanned,
    riskyEventsCount: run.riskyEventsCount,
    scrubbedEventsCount: run.scrubbedEventsCount,
    failedScrubCount: run.failedScrubCount,
    riskCodesSummary: (run.riskCodesSummary as GoogleCalendarPhiRiskCode[]) ?? [],
    approvedAt: run.approvedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function extractRiskCodesSummary(report: GoogleCalendarPhiScanReport): GoogleCalendarPhiRiskCode[] {
  return Array.from(
    new Set(report.riskyEvents.flatMap((e) => e.riskCodes)),
  ).sort() as GoogleCalendarPhiRiskCode[];
}

async function persistCalendarPhiScanToPreflightStatus(input: {
  tenantId: string;
  totalEventsScanned: number;
  riskyEventsCount: number;
  scannedAt: Date;
}): Promise<void> {
  const row = {
    tenantId: input.tenantId,
    latestCalendarPhiScanAt: input.scannedAt,
    latestCalendarPhiTotalEvents: input.totalEventsScanned,
    latestCalendarPhiRiskyEvents: input.riskyEventsCount,
    updatedAt: input.scannedAt,
  };
  await db.insert(pilotPreflightStatus).values(row).onConflictDoUpdate({
    target: pilotPreflightStatus.tenantId,
    set: row,
  });
}

async function maybeCreateStaffReviewItem(
  tenantId: string,
  report: GoogleCalendarPhiScanReport,
  remediationRunId: string,
): Promise<void> {
  if (report.riskyEventsCount === 0) return;
  const riskCodesSummary = extractRiskCodesSummary(report);
  await createStaffReviewItemSafely({
    tenantId,
    type: 'legacy_calendar_phi_detected',
    severity: 'high',
    source: 'calendar_phi_scanner',
    reasonCode: 'LEGACY_GOOGLE_CALENDAR_PHI_DETECTED',
    message: 'Legacy Google Calendar events may contain PHI and need remediation.',
    metadata: {
      riskyEventsCount: report.riskyEventsCount,
      riskCodesSummary,
      remediationRunId,
    },
    dedupeKey: 'calendar_phi:legacy_detected',
  });
}

export async function startCalendarPhiRemediationDryRun(input: {
  tenantId: string;
  now?: Date;
}): Promise<SafeCalendarPhiRemediationRunResponse> {
  assertTenantAccess(input.tenantId);
  const now = input.now ?? new Date();

  const report = await scanLegacyGoogleCalendarPhi({ tenantId: input.tenantId, now });
  const riskCodesSummary = extractRiskCodesSummary(report);

  const [run] = await db
    .insert(calendarPhiRemediationRuns)
    .values({
      tenantId: input.tenantId,
      status: 'dry_run_completed',
      mode: 'dry_run',
      totalEventsScanned: report.totalEventsScanned,
      riskyEventsCount: report.riskyEventsCount,
      riskCodesSummary,
      completedAt: now,
      updatedAt: now,
    })
    .returning();

  // Update preflight calendar phi scan status (safe — counts and codes only, no PHI)
  await persistCalendarPhiScanToPreflightStatus({
    tenantId: input.tenantId,
    totalEventsScanned: report.totalEventsScanned,
    riskyEventsCount: report.riskyEventsCount,
    scannedAt: now,
  }).catch((err) => {
    logger.warn(
      { tenantId: input.tenantId, err },
      'Failed to persist calendar phi scan to preflight status',
    );
  });

  // Create staff review item if risky events detected
  await maybeCreateStaffReviewItem(input.tenantId, report, run.id);

  logger.info(
    {
      tenantId: input.tenantId,
      runId: run.id,
      totalEventsScanned: report.totalEventsScanned,
      riskyEventsCount: report.riskyEventsCount,
      riskCodeCount: riskCodesSummary.length,
    },
    'Calendar PHI remediation dry-run completed',
  );

  return toSafeRunResponse(run);
}

export async function getLatestCalendarPhiRemediationRun(input: {
  tenantId: string;
}): Promise<SafeCalendarPhiRemediationRunResponse | null> {
  assertTenantAccess(input.tenantId);
  const [run] = await db
    .select()
    .from(calendarPhiRemediationRuns)
    .where(eq(calendarPhiRemediationRuns.tenantId, input.tenantId))
    .orderBy(desc(calendarPhiRemediationRuns.createdAt))
    .limit(1);
  return run ? toSafeRunResponse(run) : null;
}

async function getLatestCompletedDryRun(
  tenantId: string,
): Promise<CalendarPhiRemediationRun | null> {
  const [run] = await db
    .select()
    .from(calendarPhiRemediationRuns)
    .where(
      and(
        eq(calendarPhiRemediationRuns.tenantId, tenantId),
        eq(calendarPhiRemediationRuns.status, 'dry_run_completed'),
        eq(calendarPhiRemediationRuns.mode, 'dry_run'),
      ),
    )
    .orderBy(desc(calendarPhiRemediationRuns.createdAt))
    .limit(1);
  return run ?? null;
}

export async function approveAndRunCalendarPhiScrub(input: {
  tenantId: string;
  confirm: boolean;
  approvedByUserId: string;
  now?: Date;
}): Promise<SafeCalendarPhiRemediationRunResponse> {
  assertTenantAccess(input.tenantId);

  if (!input.confirm) {
    throw new ValidationError(
      'Calendar PHI scrub requires confirm=true to prevent accidental Google Calendar mutations',
    );
  }

  const dryRun = await getLatestCompletedDryRun(input.tenantId);
  if (!dryRun) {
    throw new NotFoundError(
      'A completed dry-run is required before running a confirmed calendar PHI scrub',
    );
  }

  const now = input.now ?? new Date();

  const profile = await getClinicProfile(input.tenantId);
  const timezone = profile?.timezone ?? 'Europe/London';

  const [scrubRun] = await db
    .insert(calendarPhiRemediationRuns)
    .values({
      tenantId: input.tenantId,
      status: 'scrub_running',
      mode: 'confirmed_scrub',
      totalEventsScanned: dryRun.totalEventsScanned,
      riskyEventsCount: dryRun.riskyEventsCount,
      riskCodesSummary: dryRun.riskCodesSummary,
      approvedByUserId: input.approvedByUserId,
      approvedAt: now,
      updatedAt: now,
    })
    .returning();

  try {
    const scrubResult = await scrubLegacyGoogleCalendarPhi({
      tenantId: input.tenantId,
      timezone,
      dryRun: false,
      confirm: true,
      now,
    });

    const [completed] = await db
      .update(calendarPhiRemediationRuns)
      .set({
        status: 'scrub_completed',
        scrubbedEventsCount: scrubResult.eventsScrubbed,
        failedScrubCount: scrubResult.eventsSkipped,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(calendarPhiRemediationRuns.id, scrubRun.id))
      .returning();

    // Verification scan — update preflight status after scrub (best-effort)
    try {
      const verificationReport = await scanLegacyGoogleCalendarPhi({
        tenantId: input.tenantId,
        now,
      });
      await persistCalendarPhiScanToPreflightStatus({
        tenantId: input.tenantId,
        totalEventsScanned: verificationReport.totalEventsScanned,
        riskyEventsCount: verificationReport.riskyEventsCount,
        scannedAt: now,
      });
      logger.info(
        {
          tenantId: input.tenantId,
          runId: scrubRun.id,
          verificationRiskyEventsCount: verificationReport.riskyEventsCount,
        },
        'Post-scrub verification scan completed',
      );
    } catch (verifyErr) {
      logger.warn(
        { tenantId: input.tenantId, runId: scrubRun.id, err: verifyErr },
        'Post-scrub verification scan failed — preflight status not updated',
      );
    }

    logger.info(
      {
        tenantId: input.tenantId,
        runId: scrubRun.id,
        eventsScrubbed: scrubResult.eventsScrubbed,
        eventsSkipped: scrubResult.eventsSkipped,
      },
      'Calendar PHI scrub completed',
    );

    return toSafeRunResponse(completed);
  } catch (err) {
    // Store safe error classification only — never store raw error message (may contain PHI)
    const failureCode = err instanceof Error ? err.name : 'UnknownError';
    const failureReasonCode =
      err instanceof ValidationError ? 'VALIDATION_ERROR' : 'SCRUB_EXECUTION_ERROR';

    const [failed] = await db
      .update(calendarPhiRemediationRuns)
      .set({
        status: 'scrub_failed',
        failureCode,
        failureReasonCode,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(calendarPhiRemediationRuns.id, scrubRun.id))
      .returning();

    logger.error(
      { tenantId: input.tenantId, runId: scrubRun.id, failureCode, failureReasonCode },
      'Calendar PHI scrub failed',
    );

    return toSafeRunResponse(failed);
  }
}
