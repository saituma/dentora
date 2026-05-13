import { logger } from '../../lib/logger.js';
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
    return {
      success: false,
      message: APPOINTMENT_TOOL_UNAVAILABLE_MESSAGE,
    };
  }
}
