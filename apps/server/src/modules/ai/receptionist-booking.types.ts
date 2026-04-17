import type { CalendarSlot } from '../integrations/integration.service.js';

export type BookingStatus =
  | 'idle'
  | 'collecting_preference'
  | 'offering_slots'
  | 'collecting_patient'
  | 'awaiting_confirmation'
  | 'confirmed';

export type AppointmentChangeMode = 'cancel' | 'reschedule' | 'check';

export type AppointmentChangeStatus =
  | 'idle'
  | 'collecting_details'
  | 'awaiting_confirmation'
  | 'completed';

export type RequestedPeriod = 'morning' | 'afternoon' | 'evening';

export interface PatientBookingDetails {
  fullName?: string;
  nameConfirmed?: boolean;
  namePronunciation?: string;
  age?: number;
  phoneNumber?: string;
  reasonForVisit?: string;
}

export interface BookingConversationState {
  active: boolean;
  status: BookingStatus;
  serviceName?: string;
  requestedDate?: string;
  requestedTime?: string;
  requestedPeriod?: RequestedPeriod;
  offeredSlots: CalendarSlot[];
  selectedSlot?: CalendarSlot;
  patient: PatientBookingDetails;
  nameConfirmationRequested?: boolean;
  namePronunciationRequested?: boolean;
  namePronunciationLoaded?: boolean;
  confirmationRequested: boolean;
  eventId?: string;
}

export interface AppointmentChangeState {
  active: boolean;
  mode: AppointmentChangeMode | null;
  status: AppointmentChangeStatus;
  phoneNumber?: string;
  patientName?: string;
  patientNameConfirmed?: boolean;
  currentDate?: string;
  currentTime?: string;
  preferredNewDate?: string;
  preferredNewTime?: string;
  confirmationRequested: boolean;
}

export interface ReceptionistSessionState {
  booking: BookingConversationState;
  appointmentChange: AppointmentChangeState;
}

export interface AppointmentChangeExtraction {
  mode?: AppointmentChangeMode;
  phoneNumber?: string;
  patientName?: string;
  currentDate?: string;
  currentTime?: string;
  preferredNewDate?: string;
  preferredNewTime?: string;
  confirmed: boolean;
  declined: boolean;
}

export interface BookingTurnExtraction {
  bookingIntent: boolean;
  availabilityIntent: boolean;
  serviceName?: string;
  requestedDate?: string;
  requestedTime?: string;
  requestedPeriod?: RequestedPeriod;
  selectedSlotIndex?: number;
  selectedSlotStartIso?: string;
  confirmed: boolean;
  declined: boolean;
  nameConfirmed?: boolean;
  namePronunciation?: string;
  patient: PatientBookingDetails;
}
