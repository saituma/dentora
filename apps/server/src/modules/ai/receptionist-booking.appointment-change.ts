import { logger } from '../../lib/logger.js';
import {
  cancelGoogleCalendarAppointment,
  findAvailableCalendarSlots,
  findGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment,
} from '../integrations/integration.service.js';
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
import { createEmptyAppointmentChangeState, resetAppointmentChangeState } from './receptionist-booking.state.js';
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
import { findPatientProfileByPhone } from '../patients/patients.service.js';

export function shouldHandleAppointmentChange(state: AppointmentChangeState, detectedMode: AppointmentChangeMode | null, message: string): boolean {
  return state.active || Boolean(detectedMode) || (Boolean(state.mode) && hasUsefulAppointmentDetails(message));
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
    `Current mode hint: ${input.modeHint ?? 'none'}`,
    'Return JSON only with this exact shape:',
    JSON.stringify({
      mode: null,
      phoneNumber: null,
      patientName: null,
      currentDate: null,
      currentTime: null,
      preferredNewDate: null,
      preferredNewTime: null,
      confirmed: false,
      declined: false,
    }, null, 2),
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
      phoneNumber: parsed.phoneNumber ?? undefined,
      patientName: parsed.patientName ?? undefined,
      currentDate: parsed.currentDate ?? undefined,
      currentTime: parsed.currentTime ?? undefined,
      preferredNewDate: parsed.preferredNewDate ?? undefined,
      preferredNewTime: parsed.preferredNewTime ?? undefined,
      confirmed: Boolean(parsed.confirmed),
      declined: Boolean(parsed.declined),
    };
  } catch (error) {
    logger.warn({ err: error, tenantId: input.tenantId }, 'Failed to parse appointment change extraction JSON');
    return {
      mode: detectAppointmentChangeMode(input.userMessage) ?? input.modeHint ?? undefined,
      currentDate: resolveRequestedDateFromMessage(input.userMessage, input.timezone),
      confirmed: isAffirmativeMessage(input.userMessage),
      declined: isNegativeMessage(input.userMessage),
    };
  }
}

function mergeAppointmentChangeState(state: AppointmentChangeState, extraction: AppointmentChangeExtraction): void {
  if (extraction.mode) state.mode = extraction.mode;
  if (extraction.phoneNumber) state.phoneNumber = extraction.phoneNumber.trim();
  if (extraction.patientName) state.patientName = extraction.patientName.trim();
  if (extraction.currentDate) state.currentDate = extraction.currentDate;
  if (extraction.currentTime) state.currentTime = extraction.currentTime;
  if (extraction.preferredNewDate) state.preferredNewDate = extraction.preferredNewDate;
  if (extraction.preferredNewTime) state.preferredNewTime = extraction.preferredNewTime;
}

function getMissingAppointmentChangeField(state: AppointmentChangeState): string | null {
  if (!state.mode) return 'mode';
  if (!state.phoneNumber) return 'phone_number';
  if (!state.patientNameConfirmed) return 'patient_name_confirmed';
  if (!state.currentDate) return 'current_date';
  if (state.mode === 'reschedule' && !state.preferredNewDate) return 'new_date';
  return null;
}

function buildAppointmentChangeMissingFieldQuestion(state: AppointmentChangeState, missingField: string): string {
  if (missingField === 'mode') return 'Would you like to reschedule or cancel the appointment?';
  if (missingField === 'phone_number') return 'Please share the phone number on the appointment.';
  if (missingField === 'patient_name_confirmed') return `Please confirm: is the appointment under ${state.patientName ?? 'this name'}?`;
  if (missingField === 'current_date') return 'Please share the current appointment day you want to change (for example, tomorrow or 2026-03-10).';
  if (missingField === 'new_date') return 'Please share the new day you want instead.';
  return state.mode === 'cancel'
    ? 'Please share the phone number, patient name, and appointment date/time to cancel.'
    : 'Please share the phone number, patient name, current appointment date/time, and preferred new date/time.';
}

async function executeAppointmentChange(input: {
  tenantId: string;
  context: TenantAIContext;
  state: AppointmentChangeState;
}): Promise<string> {
  const timezone = getTimezone(input.context);
  const matchedEvent = await findGoogleCalendarAppointment({
    tenantId: input.tenantId,
    timezone,
    patientName: input.state.patientName,
    phoneNumber: input.state.phoneNumber,
    appointmentDate: input.state.currentDate!,
    appointmentTime: input.state.currentTime,
  });

  if (!matchedEvent) {
    return 'I could not find that appointment in the live calendar yet. Please confirm the patient full name and exact appointment day/time.';
  }

  if (input.state.mode === 'cancel') {
    await cancelGoogleCalendarAppointment({ tenantId: input.tenantId, eventId: matchedEvent.eventId });
    return `Done — I cancelled ${matchedEvent.label} for ${input.state.patientName}.`;
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

  await rescheduleGoogleCalendarAppointment({
    tenantId: input.tenantId,
    timezone,
    eventId: matchedEvent.eventId,
    newSlot: { startIso: nextSlot.startIso, endIso: nextSlot.endIso },
  });

  return `Done — I moved the appointment for ${input.state.patientName} to ${nextSlot.label}.`;
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
      ? `Absolutely — I can help ${detectedMode === 'cancel' ? 'cancel' : 'reschedule'} an appointment at ${clinicName(context)}. Please share the phone number on the appointment.`
      : `Absolutely — I can help with that at ${clinicName(context)}. Would you like to reschedule or cancel the appointment?`;
  }

  if (detectedMode && state.mode !== detectedMode) {
    Object.assign(state, createEmptyAppointmentChangeState());
    state.active = true;
    state.mode = detectedMode;
    state.status = 'collecting_details';
    return detectedMode === 'cancel'
      ? 'Sure, switching to cancellation. Please share the phone number on the appointment.'
      : 'Sure, switching to rescheduling. Please share the phone number on the appointment.';
  }

  const extraction = await extractAppointmentChangeTurn({
    tenantId,
    timezone: getTimezone(context),
    userMessage,
    modeHint: state.mode,
  });
  mergeAppointmentChangeState(state, extraction);

  if (state.phoneNumber && !state.patientName) {
    const patient = await findPatientProfileByPhone({
      tenantId,
      phoneNumber: state.phoneNumber,
    });

    if (!patient) {
      Object.assign(state, createEmptyAppointmentChangeState());
      return 'That phone number is not found in the appointment history. Sorry, please try again.';
    }

    state.patientName = patient.fullName;
    state.patientNameConfirmed = false;
    state.status = 'collecting_details';
    return `I found ${patient.fullName} for that phone number. Is that the correct patient?`;
  }

  if (state.patientName && !state.patientNameConfirmed) {
    if (extraction.confirmed || isAffirmativeMessage(userMessage)) {
      state.patientNameConfirmed = true;
      if (!state.mode) {
        return 'Would you like to reschedule or cancel the appointment?';
      }
    } else if (extraction.declined || isNegativeMessage(userMessage)) {
      Object.assign(state, createEmptyAppointmentChangeState());
      return 'Thanks for clarifying. Please provide the correct phone number or we can connect you with the front desk.';
    } else {
      return `Please confirm if the appointment is under ${state.patientName}.`;
    }
  }

  if (!state.mode) {
    return 'Would you like to reschedule or cancel the appointment?';
  }

  if (state.phoneNumber && state.currentDate && !state.patientName) {
    const phoneMatch = await findGoogleCalendarAppointment({
      tenantId,
      timezone: getTimezone(context),
      phoneNumber: state.phoneNumber,
      appointmentDate: state.currentDate,
      appointmentTime: state.currentTime,
    });

    if (!phoneMatch) {
      state.status = 'collecting_details';
      return 'I could not find an appointment with that phone number on that day. Please verify the phone number and appointment date/time.';
    }

    state.status = 'collecting_details';
    return 'Thanks. Please confirm the patient full name on that appointment.';
  }

  const missingField = getMissingAppointmentChangeField(state);
  if (missingField) {
    state.status = 'collecting_details';
    return buildAppointmentChangeMissingFieldQuestion(state, missingField);
  }

  if (!state.confirmationRequested) {
    state.confirmationRequested = true;
    state.status = 'awaiting_confirmation';
    if (state.mode === 'cancel') {
      return `Please confirm: cancel ${state.patientName}'s appointment on ${state.currentDate}${state.currentTime ? ` at ${state.currentTime}` : ''}. Say yes to proceed or no to edit.`;
    }
    return `Please confirm: move ${state.patientName}'s appointment from ${state.currentDate}${state.currentTime ? ` at ${state.currentTime}` : ''} to ${state.preferredNewDate}${state.preferredNewTime ? ` at ${state.preferredNewTime}` : ''}. Say yes to proceed or no to edit.`;
  }

  if (extraction.declined || isNegativeMessage(userMessage)) {
    state.confirmationRequested = false;
    state.status = 'collecting_details';
    return state.mode === 'cancel' ? 'No problem. Please share the corrected cancellation details.' : 'No problem. Please share the corrected reschedule details.';
  }

  if (!(extraction.confirmed || isAffirmativeMessage(userMessage))) {
    return state.mode === 'cancel'
      ? 'Please say yes to proceed with cancellation, or no to update details.'
      : 'Please say yes to proceed with rescheduling, or no to update details.';
  }

  try {
    const outcome = await executeAppointmentChange({ tenantId, context, state });
    Object.assign(state, resetAppointmentChangeState());
    state.status = 'completed';
    return `${outcome} Anything else I can help with?`;
  } catch (error) {
    logger.error({ err: error, tenantId }, 'Failed to execute appointment change');
    state.confirmationRequested = false;
    state.status = 'collecting_details';
    return 'I ran into an issue updating the live calendar. Please verify the details and try again.';
  }
}
