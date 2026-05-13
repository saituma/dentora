import { logger } from '../../lib/logger.js';
import { createStaffReviewItemSafely } from '../staff-review/staff-review.service.js';
import { computeOnboardingReadiness } from '../onboarding/readiness.js';

export const APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE =
  "I'm sorry, appointment scheduling is temporarily unavailable. Please contact the clinic directly.";

export type AppointmentMutationToolName =
  | 'create_appointment'
  | 'cancel_appointment'
  | 'reschedule_appointment';

export interface AppointmentToolReadinessFailure {
  success: false;
  message: string;
}

export async function getAppointmentToolReadinessFailure(input: {
  tenantId: string;
  toolName: AppointmentMutationToolName;
}): Promise<AppointmentToolReadinessFailure | null> {
  const { tenantId, toolName } = input;
  try {
    const readiness = await computeOnboardingReadiness(tenantId, {
      requirePublishedConfig: true,
    });
    if (readiness.ready) return null;

    logger.warn(
      {
        tenantId,
        toolName,
        blockingIssueCodes: readiness.blockingIssues.map((issue) => issue.code),
        checkedAt: readiness.checkedAt,
      },
      'Appointment tool blocked by tenant readiness',
    );
    await createStaffReviewItemSafely({
      tenantId,
      type: 'readiness_failure',
      severity: 'high',
      source: 'onboarding_readiness',
      reasonCode: 'APPOINTMENT_TOOL_READINESS_BLOCKED',
      message: 'Appointment tool blocked because tenant readiness has blocking issues.',
      metadata: {
        toolName,
        blockingIssueCodes: readiness.blockingIssues.map((issue) => issue.code),
        checkedAt: readiness.checkedAt,
      },
      dedupeKey: `readiness:${toolName}:${readiness.blockingIssues
        .map((issue) => issue.code)
        .sort()
        .join(',')}`,
    });
    return {
      success: false,
      message: APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE,
    };
  } catch (error) {
    logger.warn(
      {
        tenantId,
        toolName,
        blockingIssueCodes: [],
        checkedAt: new Date().toISOString(),
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
      'Appointment tool readiness check failed',
    );
    await createStaffReviewItemSafely({
      tenantId,
      type: 'readiness_failure',
      severity: 'high',
      source: 'onboarding_readiness',
      reasonCode: 'APPOINTMENT_TOOL_READINESS_CHECK_FAILED',
      message: 'Appointment tool readiness check failed safely.',
      metadata: {
        toolName,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
      dedupeKey: `readiness:${toolName}:check_failed`,
    });
    return {
      success: false,
      message: APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE,
    };
  }
}
