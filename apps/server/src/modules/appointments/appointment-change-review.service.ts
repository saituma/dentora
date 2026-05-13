import { logger } from '../../lib/logger.js';
import { createStaffReviewItemSafely } from '../staff-review/staff-review.service.js';
import type { Appointment } from './appointment-ledger.service.js';

export type AppointmentChangeReviewAction = 'cancel' | 'reschedule';
export type AppointmentChangeVerificationMethod =
  | 'confirmation_id'
  | 'phone_dob_datetime'
  | 'unknown';

export interface AppointmentChangeReviewInput {
  tenantId: string;
  action: AppointmentChangeReviewAction;
  appointment: Pick<Appointment, 'id'>;
  relatedCallSessionId?: string | null;
  verificationMethod: AppointmentChangeVerificationMethod;
  requestedStartAt?: string | null;
  requestedEndAt?: string | null;
}

export const CANCEL_REVIEW_MESSAGE =
  "I've sent your cancellation request to the clinic team for review. They'll follow up if needed.";

export const RESCHEDULE_REVIEW_MESSAGE =
  "I've sent your reschedule request to the clinic team for review. They'll follow up if needed.";

export function inferAppointmentChangeVerificationMethod(input: {
  confirmationId?: string | null;
  appointmentId?: string | null;
  appAppointmentId?: string | null;
  externalCalendarEventId?: string | null;
  phoneNumber?: string | null;
  dateOfBirth?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
}): AppointmentChangeVerificationMethod {
  if (
    input.confirmationId?.trim() ||
    input.appointmentId?.trim() ||
    input.appAppointmentId?.trim() ||
    input.externalCalendarEventId?.trim()
  ) {
    return 'confirmation_id';
  }

  if (
    input.phoneNumber?.trim() &&
    input.dateOfBirth?.trim() &&
    input.appointmentDate?.trim() &&
    input.appointmentTime?.trim()
  ) {
    return 'phone_dob_datetime';
  }

  return 'unknown';
}

export async function createAppointmentChangeReviewItem(
  input: AppointmentChangeReviewInput,
): Promise<void> {
  const isCancel = input.action === 'cancel';
  await createStaffReviewItemSafely({
    tenantId: input.tenantId,
    type: isCancel ? 'cancellation_requested' : 'reschedule_requested',
    severity: 'medium',
    source: 'ai_tool',
    relatedAppointmentId: input.appointment.id,
    relatedCallSessionId: input.relatedCallSessionId ?? null,
    reasonCode: isCancel
      ? 'AI_CANCEL_REQUEST_REQUIRES_STAFF_APPROVAL'
      : 'AI_RESCHEDULE_REQUEST_REQUIRES_STAFF_APPROVAL',
    message: isCancel
      ? 'AI cancellation request requires staff approval.'
      : 'AI reschedule request requires staff approval.',
    metadata: {
      requestedAction: input.action,
      ...(input.action === 'reschedule' && input.requestedStartAt
        ? { requestedStartAt: input.requestedStartAt }
        : {}),
      ...(input.action === 'reschedule' && input.requestedEndAt
        ? { requestedEndAt: input.requestedEndAt }
        : {}),
      verificationMethod: input.verificationMethod,
      pilotApprovalRequired: true,
    },
    dedupeKey: `ai_appointment_change_review:${input.action}:${input.appointment.id}`,
  });

  logger.info(
    {
      tenantId: input.tenantId,
      toolName: input.action === 'cancel' ? 'cancel_appointment' : 'reschedule_appointment',
      reviewItemCreated: true,
      reasonCode: isCancel
        ? 'AI_CANCEL_REQUEST_REQUIRES_STAFF_APPROVAL'
        : 'AI_RESCHEDULE_REQUEST_REQUIRES_STAFF_APPROVAL',
      relatedAppointmentId: input.appointment.id,
      relatedCallSessionId: input.relatedCallSessionId ?? null,
    },
    'AI appointment change routed to staff review',
  );
}
