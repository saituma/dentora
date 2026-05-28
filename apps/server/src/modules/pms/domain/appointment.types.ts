import type { Patient } from './patient.types.js';

export const SCHEDULING_PROVIDERS = [
  'google_calendar',
  'dentally',
  'soe_exact',
  'cs_r4_plus',
] as const;

export type SchedulingProviderKey = (typeof SCHEDULING_PROVIDERS)[number];

export const SCHEDULING_SOURCE_OF_TRUTH_VALUES = [
  'google_calendar',
  'pms',
  'local_ledger',
] as const;

export type SchedulingSourceOfTruth = (typeof SCHEDULING_SOURCE_OF_TRUTH_VALUES)[number];

export const GOOGLE_SYNC_MODES = [
  'disabled',
  'mirror_busy',
  'mirror_full',
  'fallback_only',
] as const;

export type GoogleSyncMode = (typeof GOOGLE_SYNC_MODES)[number];

export const EXTERNAL_ENTITY_TYPES = [
  'appointment',
  'patient',
  'clinician',
  'room',
  'service',
  'treatment_type',
] as const;

export type ExternalEntityType = (typeof EXTERNAL_ENTITY_TYPES)[number];

export function isSchedulingProvider(value: string): value is SchedulingProviderKey {
  return SCHEDULING_PROVIDERS.some((provider) => provider === value);
}

export function isSchedulingSourceOfTruth(value: string): value is SchedulingSourceOfTruth {
  return SCHEDULING_SOURCE_OF_TRUTH_VALUES.some((source) => source === value);
}

export function isGoogleSyncMode(value: string): value is GoogleSyncMode {
  return GOOGLE_SYNC_MODES.some((mode) => mode === value);
}

export function isExternalEntityType(value: string): value is ExternalEntityType {
  return EXTERNAL_ENTITY_TYPES.some((entityType) => entityType === value);
}

export interface Slot {
  startIso: string;
  endIso: string;
  label: string;
}

export interface ExternalAppointmentSummary {
  id: string;
  provider: SchedulingProviderKey;
  summary: string;
  description?: string;
  htmlLink?: string;
  startIso: string;
  endIso: string;
  status: string;
}

export interface ListAppointmentsParams {
  tenantId: string;
  days?: number;
  maxResults?: number;
  now?: Date;
}

export interface ListAppointmentsResult {
  sourceId?: string;
  appointments: ExternalAppointmentSummary[];
}

export interface FindAppointmentParams {
  tenantId: string;
  timezone: string;
  patientName?: string;
  phoneNumber?: string;
  appointmentDate?: string;
  appointmentTime?: string | null;
}

export type RequestedPeriod = 'morning' | 'afternoon' | 'evening';

export interface AvailabilityParams {
  tenantId: string;
  timezone: string;
  requestedDate: string;
  requestedTime?: string | null;
  requestedPeriod?: RequestedPeriod | null;
  appointmentDurationMinutes: number;
  bufferBetweenAppointmentsMinutes?: number;
  operatingSchedule?: Record<string, unknown> | null;
  closedDates?: string[] | null;
  maxSlots?: number;
  lookAheadDays?: number;
  minimumStartAt?: Date;
  practitionerIds?: string[];
}

export interface CreateAppointmentParams {
  tenantId: string;
  timezone: string;
  appAppointmentId?: string;
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

export interface RescheduleAppointmentParams {
  tenantId: string;
  timezone: string;
  appAppointmentId?: string;
  slot: {
    startIso: string;
    endIso: string;
  };
}

export interface Appointment {
  id: string;
  tenantId: string;
  provider: SchedulingProviderKey;
  slot: Slot;
  patient?: Patient;
  htmlLink?: string;
  appAppointmentId?: string;
  externalPatientId?: string;
  externalClinicianId?: string;
  externalRoomId?: string;
}

export interface UpsertPatientParams {
  tenantId: string;
  patient: {
    fullName: string;
    phoneNumber: string;
    dateOfBirth?: string | null;
    reasonForVisit?: string | null;
  };
}

export interface ProviderHealthCheckResult {
  provider: SchedulingProviderKey;
  healthy: boolean;
  checkedAt: string;
  message?: string;
}
