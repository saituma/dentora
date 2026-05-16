import {
  handleAppointmentChangeTurn,
  shouldHandleAppointmentChange,
} from './receptionist-booking.appointment-change.js';
import {
  ensureSessionState,
  createInitialReceptionistSessionState,
  resetBookingState,
} from './receptionist-booking.state.js';
import type { ReceptionistSessionState } from './receptionist-booking.types.js';
import { detectAppointmentChangeMode } from './receptionist-booking.utils.js';
import { processBookingTurn } from './receptionist-booking.flow.js';
import type { TenantAIContext } from './ai.service.js';

export { createInitialReceptionistSessionState };
export type {
  AppointmentChangeState,
  BookingConversationState,
  PatientBookingDetails,
  ReceptionistSessionState,
} from './receptionist-booking.types.js';

export async function processReceptionistTurnWithBooking(input: {
  tenantId: string;
  sessionId: string;
  aiContext: TenantAIContext;
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  userMessage: string;
  sessionState?: ReceptionistSessionState;
  /** Inbound caller number from Twilio/browser — pre-fills patient phone so AI never asks for it. */
  callerNumber?: string;
}): Promise<{ response: string; sessionState: ReceptionistSessionState }> {
  const sessionState = ensureSessionState(input.sessionState);

  // Pre-populate the patient phone number from the inbound caller ID so the AI never asks for it.
  if (input.callerNumber && !sessionState.booking.patient.phoneNumber) {
    sessionState.booking.patient.phoneNumber = input.callerNumber;
  }
  const bookingState = sessionState.booking;
  const appointmentChangeState = sessionState.appointmentChange;
  const detectedAppointmentChangeMode = detectAppointmentChangeMode(input.userMessage);

  if (detectedAppointmentChangeMode && bookingState.active) {
    sessionState.booking = resetBookingState();
  }

  if (
    shouldHandleAppointmentChange(
      appointmentChangeState,
      detectedAppointmentChangeMode,
      input.userMessage,
    )
  ) {
    return {
      response: await handleAppointmentChangeTurn({
        tenantId: input.tenantId,
        context: input.aiContext,
        userMessage: input.userMessage,
        state: appointmentChangeState,
        detectedMode: detectedAppointmentChangeMode,
      }),
      sessionState,
    };
  }

  return processBookingTurn({
    ...input,
    sessionState,
  });
}
