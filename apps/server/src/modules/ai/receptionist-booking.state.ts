import type {
  AppointmentChangeState,
  BookingConversationState,
  ReceptionistSessionState,
} from './receptionist-booking.types.js';

export function createEmptyAppointmentChangeState(): AppointmentChangeState {
  return {
    active: false,
    mode: null,
    status: 'idle',
    patientNameConfirmed: false,
    confirmationRequested: false,
  };
}

export function createEmptyBookingState(): BookingConversationState {
  return {
    active: false,
    status: 'idle',
    offeredSlots: [],
    patient: {},
    nameConfirmationRequested: false,
    namePronunciationRequested: false,
    namePronunciationLoaded: false,
    confirmationRequested: false,
  };
}

export function resetAppointmentChangeState(): AppointmentChangeState {
  return createEmptyAppointmentChangeState();
}

export function resetBookingState(): BookingConversationState {
  return createEmptyBookingState();
}

export function createInitialReceptionistSessionState(): ReceptionistSessionState {
  return {
    booking: createEmptyBookingState(),
    appointmentChange: createEmptyAppointmentChangeState(),
  };
}

export function ensureSessionState(state?: ReceptionistSessionState): ReceptionistSessionState {
  return {
    booking: {
      ...createEmptyBookingState(),
      ...(state?.booking ?? {}),
      offeredSlots: state?.booking?.offeredSlots ?? [],
      patient: {
        ...createEmptyBookingState().patient,
        ...(state?.booking?.patient ?? {}),
      },
    },
    appointmentChange: {
      ...createEmptyAppointmentChangeState(),
      ...(state?.appointmentChange ?? {}),
    },
  };
}
