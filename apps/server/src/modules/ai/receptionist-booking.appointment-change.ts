import { logger } from '../../lib/logger.js';
import { findAvailableCalendarSlots } from '../integrations/integration.service.js';
import {
  cancelLedgerBackedAppointment,
  rescheduleLedgerBackedAppointment,
} from '../appointments/appointment-application.service.js';
import { features } from '../../config/features.js';
import { getAppointmentToolReadinessFailure } from '../appointments/appointment-tool-readiness.js';
import {
  APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
  APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
  resolveVerifiedAppointmentForCaller,
} from '../appointments/appointment-lookup.service.js';
import {
  CANCEL_REVIEW_MESSAGE,
  RESCHEDULE_REVIEW_MESSAGE,
  createAppointmentChangeReviewItem,
  inferAppointmentChangeVerificationMethod,
} from '../appointments/appointment-change-review.service.js';
import { executeLlmWithFailover } from './engine/index.js';
import type { TenantAIContext } from './ai.service.js';
import {
  clinicName,
  getAppointmentDuration,
  getBufferMinutes,
  getClosedDates,
  getOperatingSchedule,
  getTimezone,
} from './receptionist-booking.context.js';
import {
  createEmptyAppointmentChangeState,
  resetAppointmentChangeState,
} from './receptionist-booking.state.js';
import type {
  AppointmentChangeExtraction,
  AppointmentChangeMode,
  AppointmentChangeState,
} from './receptionist-booking.types.js';
import {
  detectAppointmentChangeMode,
  formatTodayForPrompt,
  hasUsefulAppointmentDetails,
  isAffirmativeMessage,
  isNegativeMessage,
  normalizeJsonBlock,
  resolveRequestedDateFromMessage,
} from './receptionist-booking.utils.js';

export function shouldHandleAppointmentChange(
  state: AppointmentChangeState,
  detectedMode: AppointmentChangeMode | null,
  message: string,
): boolean {
  return (
    state.active ||
    Boolean(detectedMode) ||
    (Boolean(state.mode) && hasUsefulAppointmentDetails(message))
  );
}

async function extractAppointmentChangeTurn(input: {
  tenantId: string;
  timezone: string;
  userMessage: string;
  modeHint?: AppointmentChangeMode | null;
}): Promise<AppointmentChangeExtraction> {
  const prompt = [
    'Extract appointment cancellation/reschedule details from a caller message.',
    `Timezone: ${input.timezone}`,
    `Today: ${formatTodayForPrompt(input.timezone)}`,
    'Normalize dates to YYYY-MM-DD and times to HH:MM 24-hour.',
    'Mode can be: cancel, reschedule, or check (for appointment status).',
    `Current mode hint: ${input.modeHint ?? 'none'}`,
    'Return JSON only with this exact shape:',
    JSON.stringify(
      {
        mode: null,
        confirmationId: null,
        phoneNumber: null,
        dateOfBirth: null,
        patientName: null,
        currentDate: null,
        currentTime: null,
        preferredNewDate: null,
        preferredNewTime: null,
        confirmed: false,
        declined: false,
      },
      null,
      2,
    ),
    '',
    `Caller message: ${input.userMessage}`,
  ].join('\n');

  try {
    const result = await executeLlmWithFailover({
      workloadType: 'llm',
      tenantId: input.tenantId,
      maxLatencyMs: 7000,
      minReliability: 0.85,
      llmRequest: {
        model: 'gpt-4o-mini',
        tenantId: input.tenantId,
        temperature: 0.1,
        maxTokens: 350,
        messages: [{ role: 'system', content: prompt }],
      },
    });

    const parsed = JSON.parse(normalizeJsonBlock(result.content)) as {
      mode?: AppointmentChangeMode | null;
      confirmationId?: string | null;
      phoneNumber?: string | null;
      dateOfBirth?: string | null;
      patientName?: string | null;
      currentDate?: string | null;
      currentTime?: string | null;
      preferredNewDate?: string | null;
      preferredNewTime?: string | null;
      confirmed?: boolean;
      declined?: boolean;
    };

    return {
      mode: parsed.mode ?? undefined,
      confirmationId: parsed.confirmationId ?? undefined,
      phoneNumber: parsed.phoneNumber ?? undefined,
      dateOfBirth: parsed.dateOfBirth ?? undefined,
      patientName: parsed.patientName ?? undefined,
      currentDate: parsed.currentDate ?? undefined,
      currentTime: parsed.currentTime ?? undefined,
      preferredNewDate: parsed.preferredNewDate ?? undefined,
      preferredNewTime: parsed.preferredNewTime ?? undefined,
      confirmed: Boolean(parsed.confirmed),
      declined: Boolean(parsed.declined),
    };
  } catch (error) {
    logger.warn(
      { tenantId: input.tenantId, errorName: error instanceof Error ? error.name : 'UnknownError' },
      'Failed to parse appointment change extraction JSON',
    );
    return {
      mode: detectAppointmentChangeMode(input.userMessage) ?? input.modeHint ?? undefined,
      currentDate: resolveRequestedDateFromMessage(input.userMessage, input.timezone),
      confirmed: isAffirmativeMessage(input.userMessage),
      declined: isNegativeMessage(input.userMessage),
    };
  }
}

function mergeAppointmentChangeState(
  state: AppointmentChangeState,
  extraction: AppointmentChangeExtraction,
): void {
  if (extraction.mode) state.mode = extraction.mode;
  if (extraction.confirmationId) state.confirmationId = extraction.confirmationId.trim();
  if (extraction.phoneNumber) state.phoneNumber = extraction.phoneNumber.trim();
  if (extraction.dateOfBirth) state.dateOfBirth = extraction.dateOfBirth.trim();
  if (extraction.patientName) state.patientName = extraction.patientName.trim();
  if (extraction.currentDate) state.currentDate = extraction.currentDate;
  if (extraction.currentTime) state.currentTime = extraction.currentTime;
  if (extraction.preferredNewDate) state.preferredNewDate = extraction.preferredNewDate;
  if (extraction.preferredNewTime) state.preferredNewTime = extraction.preferredNewTime;
}

function getMissingAppointmentChangeField(state: AppointmentChangeState): string | null {
  if (!state.mode) return 'mode';
  if (state.confirmationId) {
    if (state.mode === 'reschedule' && !state.preferredNewDate) return 'new_date';
    return null;
  }
  if (!state.phoneNumber) return 'phone_number';
  if (!state.dateOfBirth) return 'date_of_birth';
  if (!state.currentDate) return 'appointment_date';
  if (!state.currentTime) return 'appointment_time';
  if (state.mode === 'reschedule' && !state.preferredNewDate) return 'new_date';
  return null;
}

function buildAppointmentChangeMissingFieldQuestion(
  state: AppointmentChangeState,
  missingField: string,
): string {
  if (missingField === 'mode')
    return 'Would you like to reschedule, cancel, or check the appointment?';
  if (missingField === 'phone_number') return APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE;
  if (missingField === 'date_of_birth') return APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE;
  if (missingField === 'appointment_date') return APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE;
  if (missingField === 'appointment_time') return APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE;
  if (missingField === 'new_date') return 'Please share the new day you want instead.';
  if (state.mode === 'check') return APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE;
  return APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE;
}

async function executeAppointmentChange(input: {
  tenantId: string;
  context: TenantAIContext;
  state: AppointmentChangeState;
}): Promise<string> {
  const timezone = getTimezone(input.context);
  if (input.state.mode === 'cancel' || input.state.mode === 'reschedule') {
    const readinessFailure = await getAppointmentToolReadinessFailure({
      tenantId: input.tenantId,
      toolName: input.state.mode === 'cancel' ? 'cancel_appointment' : 'reschedule_appointment',
    });
    if (readinessFailure) return readinessFailure.message;
  }

  const verificationInput = {
    tenantId: input.tenantId,
    confirmationId: input.state.confirmationId,
    phoneNumber: input.state.phoneNumber,
    dateOfBirth: input.state.dateOfBirth,
    appointmentDate: input.state.currentDate,
    appointmentTime: input.state.currentTime,
    timezone,
    operation:
      input.state.mode === 'check'
        ? 'check_appointment'
        : input.state.mode === 'cancel'
          ? 'cancel_appointment'
          : 'reschedule_appointment',
  } as const;
  const verified = await resolveVerifiedAppointmentForCaller(verificationInput);

  if (!verified.success) {
    return verified.message;
  }

  if (input.state.mode === 'check') {
    return 'I verified that appointment.';
  }

  if (input.state.mode === 'cancel') {
    if (features.aiAppointmentChangesRequireReview) {
      await createAppointmentChangeReviewItem({
        tenantId: input.tenantId,
        action: 'cancel',
        appointment: verified.appointment,
        verificationMethod: inferAppointmentChangeVerificationMethod(verificationInput),
      });
      return CANCEL_REVIEW_MESSAGE;
    }

    await cancelLedgerBackedAppointment({
      tenantId: input.tenantId,
      eventId: verified.externalCalendarEventId,
    });
    return 'Done - I cancelled the appointment.';
  }

  const availability = await findAvailableCalendarSlots({
    tenantId: input.tenantId,
    timezone,
    requestedDate: input.state.preferredNewDate!,
    requestedTime: input.state.preferredNewTime ?? null,
    appointmentDurationMinutes: getAppointmentDuration(input.context),
    bufferBetweenAppointmentsMinutes: getBufferMinutes(input.context),
    operatingSchedule: getOperatingSchedule(input.context),
    closedDates: getClosedDates(input.context),
    maxSlots: 3,
    lookAheadDays: 7,
  });

  const nextSlot = availability.exactMatch ?? availability.suggestedSlots[0];
  if (!nextSlot) {
    return 'I could not find an available slot for that new day/time. Please share an alternative day or time and I can try again.';
  }

  if (features.aiAppointmentChangesRequireReview) {
    await createAppointmentChangeReviewItem({
      tenantId: input.tenantId,
      action: 'reschedule',
      appointment: verified.appointment,
      requestedStartAt: nextSlot.startIso,
      requestedEndAt: nextSlot.endIso,
      verificationMethod: inferAppointmentChangeVerificationMethod(verificationInput),
    });
    return RESCHEDULE_REVIEW_MESSAGE;
  }

  await rescheduleLedgerBackedAppointment({
    tenantId: input.tenantId,
    timezone,
    eventId: verified.externalCalendarEventId,
    slot: { startIso: nextSlot.startIso, endIso: nextSlot.endIso },
  });

  return `Done - I moved the appointment to ${nextSlot.label}.`;
}

export async function handleAppointmentChangeTurn(input: {
  tenantId: string;
  context: TenantAIContext;
  userMessage: string;
  state: AppointmentChangeState;
  detectedMode: AppointmentChangeMode | null;
}): Promise<string> {
  const { state, detectedMode, context, tenantId, userMessage } = input;

  if (!state.active) {
    state.active = true;
    state.mode = detectedMode;
    state.status = 'collecting_details';
    state.confirmationRequested = false;
    return detectedMode
      ? `Absolutely — I can help ${detectedMode === 'cancel' ? 'cancel' : detectedMode === 'check' ? 'check' : 'reschedule'} an appointment at ${clinicName(context)}. Please share the phone number on the appointment.`
      : `Absolutely — I can help with that at ${clinicName(context)}. Would you like to reschedule or cancel the appointment?`;
  }

  if (detectedMode && state.mode !== detectedMode) {
    Object.assign(state, createEmptyAppointmentChangeState());
    state.active = true;
    state.mode = detectedMode;
    state.status = 'collecting_details';
    return detectedMode === 'cancel'
      ? 'Sure, switching to cancellation. Please share the phone number on the appointment.'
      : detectedMode === 'check'
        ? 'Sure, I can check the appointment. Please share the phone number on the appointment.'
        : 'Sure, switching to rescheduling. Please share the phone number on the appointment.';
  }

  const extraction = await extractAppointmentChangeTurn({
    tenantId,
    timezone: getTimezone(context),
    userMessage,
    modeHint: state.mode,
  });
  mergeAppointmentChangeState(state, extraction);

  if (!state.mode) {
    return 'Would you like to reschedule, cancel, or check the appointment?';
  }

  const missingField = getMissingAppointmentChangeField(state);
  if (missingField) {
    state.status = 'collecting_details';
    return buildAppointmentChangeMissingFieldQuestion(state, missingField);
  }

  if (state.mode === 'check') {
    try {
      const outcome = await executeAppointmentChange({ tenantId, context, state });
      Object.assign(state, resetAppointmentChangeState());
      state.status = 'completed';
      return `${outcome} Anything else I can help with?`;
    } catch (error) {
      logger.error(
        { tenantId, errorName: error instanceof Error ? error.name : 'UnknownError' },
        'Failed to check appointment',
      );
      state.confirmationRequested = false;
      state.status = 'collecting_details';
      return APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE;
    }
  }

  if (!state.confirmationRequested) {
    state.confirmationRequested = true;
    state.status = 'awaiting_confirmation';
    if (state.mode === 'cancel') {
      return `Please confirm: cancel the appointment on ${state.currentDate}${state.currentTime ? ` at ${state.currentTime}` : ''}. Say yes to proceed or no to edit.`;
    }
    return `Please confirm: move the appointment from ${state.currentDate}${state.currentTime ? ` at ${state.currentTime}` : ''} to ${state.preferredNewDate}${state.preferredNewTime ? ` at ${state.preferredNewTime}` : ''}. Say yes to proceed or no to edit.`;
  }

  if (extraction.declined || isNegativeMessage(userMessage)) {
    state.confirmationRequested = false;
    state.status = 'collecting_details';
    return state.mode === 'cancel'
      ? 'No problem. Please share the corrected cancellation details.'
      : 'No problem. Please share the corrected reschedule details.';
  }

  if (!(extraction.confirmed || isAffirmativeMessage(userMessage))) {
    return state.mode === 'cancel'
      ? 'Please say yes to proceed with cancellation, or no to update details.'
      : 'Please say yes to proceed with rescheduling, or no to update details.';
  }

  try {
    const outcome = await executeAppointmentChange({ tenantId, context, state });
    const wasReviewModeChange =
      features.aiAppointmentChangesRequireReview &&
      (state.mode === 'cancel' || state.mode === 'reschedule');
    Object.assign(state, resetAppointmentChangeState());
    state.status = 'completed';
    if (wasReviewModeChange) return outcome;
    return `${outcome} Anything else I can help with?`;
  } catch (error) {
    logger.error(
      { tenantId, errorName: error instanceof Error ? error.name : 'UnknownError' },
      'Failed to execute appointment change',
    );
    state.confirmationRequested = false;
    state.status = 'collecting_details';
    return 'I ran into an issue updating the live calendar. Please verify the details and try again.';
  }
}
