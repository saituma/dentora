import type { InferSelectModel } from 'drizzle-orm';
import { integrations } from '../../db/schema.js';

export type Integration = InferSelectModel<typeof integrations>;

export interface GoogleOAuthStatePayload {
  tenantId: string;
  accountEmail?: string;
  calendarId?: string;
  returnTo?: string;
  createdAt: string;
}

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleCalendarIdentity {
  accountEmail?: string;
  calendarId?: string;
}

export interface CalendarSlot {
  startIso: string;
  endIso: string;
  label: string;
}

export interface CalendarAvailabilityInput {
  tenantId: string;
  timezone: string;
  requestedDate: string;
  requestedTime?: string | null;
  requestedPeriod?: 'morning' | 'afternoon' | 'evening' | null;
  appointmentDurationMinutes: number;
  bufferBetweenAppointmentsMinutes?: number;
  operatingSchedule?: Record<string, unknown> | null;
  closedDates?: string[] | null;
  maxSlots?: number;
  lookAheadDays?: number;
}

export interface CreateCalendarAppointmentInput {
  tenantId: string;
  timezone: string;
  slot: {
    startIso: string;
    endIso: string;
  };
  summary: string;
  patient: {
    fullName: string;
    age?: number | null;
    phoneNumber: string;
    reasonForVisit: string;
    dateOfBirth?: string | null;
  };
}

export interface FindCalendarAppointmentInput {
  tenantId: string;
  timezone: string;
  patientName?: string;
  phoneNumber?: string;
  appointmentDate: string;
  appointmentTime?: string | null;
}

export interface CalendarAppointmentMatch {
  eventId: string;
  summary: string;
  startIso: string;
  endIso: string;
  label: string;
}
