import type {
  Appointment,
  AvailabilityParams,
  CreateAppointmentParams,
  ExternalAppointmentSummary,
  FindAppointmentParams,
  ListAppointmentsParams,
  ListAppointmentsResult,
  ProviderHealthCheckResult,
  RescheduleAppointmentParams,
  Slot,
  UpsertPatientParams,
} from '../domain/appointment.types.js';
import type { Patient } from '../domain/patient.types.js';

export interface SchedulingProviderPort {
  listAppointments(params: ListAppointmentsParams): Promise<ListAppointmentsResult>;

  findAppointment(params: FindAppointmentParams): Promise<ExternalAppointmentSummary | null>;

  getAvailability(params: AvailabilityParams): Promise<Slot[]>;

  createAppointment(params: CreateAppointmentParams): Promise<Appointment>;

  cancelAppointment(id: string): Promise<void>;

  rescheduleAppointment(id: string, params: RescheduleAppointmentParams): Promise<Appointment>;

  findPatient(phone: string): Promise<Patient | null>;

  upsertPatient(params: UpsertPatientParams): Promise<Patient>;

  validateCredentials(): Promise<void>;

  healthCheck(): Promise<ProviderHealthCheckResult>;
}
