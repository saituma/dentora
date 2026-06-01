import type { Clinician } from '../../domain/clinician.types.js';
import type { Room } from '../../domain/room.types.js';

export interface DentallyConfig {
  baseUrl: string;
  appointmentPath: string;
  patientPath: string;
  clinicianPath: string;
  roomPath: string;
  webhookPath: string;
  authPath: string;
  signatureHeader: string;
  timestampHeader: string;
  replayWindowSeconds: number;
  timeoutMs: number;
  maxRetries: number;
  accountId?: string;
  practiceId?: string;
  practiceName?: string;
  // Read-only integrations use a practice-issued token (patient:read + appointment:read)
  // that Dentally grants without partner approval. Writes are rejected at the client.
  readOnly: boolean;
}

export interface DentallyStoredCredentials {
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  accessTokenExpiresAt?: string;
  scopes?: string[];
  tokenType?: string;
  accountId?: string;
  practiceId?: string;
  practiceName?: string;
  encryptedClientId?: string;
  encryptedClientSecret?: string;
  encryptedWebhookSecret?: string;
}

export interface DentallyPlainCredentialsInput {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  scopes?: string[];
  tokenType?: string;
  accountId?: string;
  practiceId?: string;
  practiceName?: string;
  clientId?: string;
  clientSecret?: string;
  webhookSecret?: string;
}

export interface DentallyAuthContext {
  baseUrl: string;
  authorizationHeader: string;
  correlationId: string;
  integrationId: string;
  tenantId: string;
  config: DentallyConfig;
  credentials: DentallyStoredCredentials;
}

export type DentallyRequestMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface DentallyPatient {
  id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  mobile?: string | null;
  telephone?: string | null;
  mobile_phone?: string | null;
  home_phone?: string | null;
  work_phone?: string | null;
  date_of_birth?: string | null;
  dob?: string | null;
  email?: string | null;
  email_address?: string | null;
  updated_at?: string | null;
}

export interface DentallyClinician {
  id: string | number;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  active?: boolean | null;
}

export interface DentallyAppointmentReason {
  id: string | number;
  name?: string | null;
  reason?: string | null;
  duration?: number | null;
  active?: boolean | null;
  deleted?: boolean | null;
}

export interface DentallyRoom {
  id: string | number;
  name?: string | null;
  active?: boolean | null;
}

export interface DentallyTreatmentType {
  id: string | number;
  name?: string | null;
  nomenclature?: string | null;
  patient_nomenclature?: string | null;
  code?: string | null;
  treatment_category_id?: string | number | null;
  duration?: number | null;
  active?: boolean | null;
}

export interface LocalTreatmentType {
  id: string;
  externalId?: string;
  name: string;
  code?: string;
  durationMinutes?: number;
  isActive: boolean;
}

export interface DentallyAppointment {
  id: string | number;
  patient_id?: string | number | null;
  patient_name?: string | null;
  patient?: DentallyPatient | null;
  practitioner_id?: string | number | null;
  clinician_id?: string | number | null;
  practitioner?: DentallyClinician | null;
  clinician?: DentallyClinician | null;
  room_id?: string | number | null;
  room?: DentallyRoom | null;
  treatment_id?: string | number | null;
  treatment?: DentallyTreatmentType | null;
  start_time?: string | null;
  start_at?: string | null;
  start?: string | null;
  finish_time?: string | null;
  end_time?: string | null;
  end_at?: string | null;
  end?: string | null;
  duration?: number | null;
  state?: string | null;
  status?: string | null;
  cancelled?: boolean | null;
  cancelled_at?: string | null;
  notes?: string | null;
  reason?: string | null;
  treatment_description?: string | null;
  updated_at?: string | null;
}

export interface DentallyAppointmentCreateRequest {
  patient_id: string;
  start_time: string;
  finish_time: string;
  notes?: string;
  reason?: string;
  practitioner_id?: string;
  room_id?: string;
}

export interface DentallyAppointmentUpdateRequest {
  start_time?: string;
  finish_time?: string;
  state?: string;
  notes?: string;
  reason?: string;
}

export interface DentallyListAppointmentsRequest {
  on?: string;
  before?: string;
  after?: string;
  practitioner_id?: string;
  patient_id?: string;
  room_id?: string;
  site_id?: string;
  state?: string;
  cancelled?: boolean;
  per_page?: number;
  startIso?: string;
  endIso?: string;
  limit?: number;
}

export interface DentallyAvailabilityRequest {
  start_time: string;
  finish_time: string;
  practitioner_ids: string[];
  duration: number;
}

export interface DentallyAvailabilitySlot {
  start_time?: string | null;
  finish_time?: string | null;
  start?: string | null;
  end?: string | null;
  practitioner_id?: string | number | null;
  room_id?: string | number | null;
}

export interface DentallyPatientUpsertRequest {
  first_name?: string;
  last_name?: string;
  preferred_name?: string;
  home_phone?: string;
  mobile_phone?: string;
  date_of_birth?: string;
  metadata?: Record<string, unknown>;
}

export interface DentallyAvailabilityWindow {
  startIso: string;
  endIso: string;
}

export interface DentallyMappedAppointmentRelations {
  clinician?: Clinician;
  room?: Room;
  treatmentType?: LocalTreatmentType;
}
