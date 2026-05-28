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
} from '../../domain/appointment.types.js';
import type { Patient } from '../../domain/patient.types.js';
import type { SchedulingProviderPort } from '../../ports/scheduling-provider.port.js';

interface SimAppointment extends Appointment {
  status: string;
  summary: string;
}

export class SoeExactSimulatorSchedulingProvider implements SchedulingProviderPort {
  private readonly tenantId: string;
  private readonly appointments = new Map<string, SimAppointment>();
  private readonly patients = new Map<string, Patient>();
  private sequence = 1;

  public constructor(input: { tenantId: string }) {
    this.tenantId = input.tenantId;
  }

  public async listAppointments(_params: ListAppointmentsParams): Promise<ListAppointmentsResult> {
    return {
      sourceId: 'soe-exact-simulator',
      appointments: [...this.appointments.values()].map((appointment) => this.summary(appointment)),
    };
  }

  public async findAppointment(
    params: FindAppointmentParams,
  ): Promise<ExternalAppointmentSummary | null> {
    const appointment = [...this.appointments.values()].find(
      (item) =>
        (!params.patientName ||
          (item.patient?.fullName ?? '')
            .toLowerCase()
            .includes(params.patientName.toLowerCase())) &&
        (!params.appointmentDate || item.slot.startIso.startsWith(params.appointmentDate)),
    );
    return appointment ? this.summary(appointment) : null;
  }

  public async getAvailability(params: AvailabilityParams): Promise<Slot[]> {
    const startIso = `${params.requestedDate}T09:00:00.000Z`;
    const endIso = new Date(
      new Date(startIso).getTime() + params.appointmentDurationMinutes * 60_000,
    ).toISOString();
    return [{ startIso, endIso, label: `SOE/EXACT simulator ${startIso}` }];
  }

  public async createAppointment(params: CreateAppointmentParams): Promise<Appointment> {
    this.assertTenant(params.tenantId);
    const patient = await this.upsertPatient({
      tenantId: params.tenantId,
      patient: params.patient,
    });
    const appointment: SimAppointment = {
      id: `soe-sim-appointment-${this.sequence++}`,
      tenantId: params.tenantId,
      provider: 'soe_exact',
      slot: { ...params.slot, label: params.summary },
      patient,
      appAppointmentId: params.appAppointmentId,
      externalPatientId: patient.externalId,
      status: 'confirmed',
      summary: params.summary,
    };
    this.appointments.set(appointment.id, appointment);
    return appointment;
  }

  public async cancelAppointment(id: string): Promise<void> {
    const appointment = this.appointments.get(id);
    if (appointment) appointment.status = 'cancelled';
  }

  public async rescheduleAppointment(
    id: string,
    params: RescheduleAppointmentParams,
  ): Promise<Appointment> {
    this.assertTenant(params.tenantId);
    const appointment = this.appointments.get(id);
    if (!appointment) throw new Error('SOE/EXACT simulator appointment not found');
    appointment.slot = { ...params.slot, label: appointment.slot.label };
    return appointment;
  }

  public async findPatient(phone: string): Promise<Patient | null> {
    return [...this.patients.values()].find((patient) => patient.phoneNumber === phone) ?? null;
  }

  public async upsertPatient(params: UpsertPatientParams): Promise<Patient> {
    this.assertTenant(params.tenantId);
    const existing = await this.findPatient(params.patient.phoneNumber);
    if (existing) return existing;
    const externalId = `soe-sim-patient-${this.sequence++}`;
    const patient: Patient = {
      id: externalId,
      externalId,
      fullName: params.patient.fullName,
      phoneNumber: params.patient.phoneNumber,
      dateOfBirth: params.patient.dateOfBirth ?? null,
    };
    this.patients.set(externalId, patient);
    return patient;
  }

  public async validateCredentials(): Promise<void> {
    return;
  }

  public async healthCheck(): Promise<ProviderHealthCheckResult> {
    return { provider: 'soe_exact', healthy: true, checkedAt: new Date().toISOString() };
  }

  private summary(appointment: SimAppointment): ExternalAppointmentSummary {
    return {
      id: appointment.id,
      provider: 'soe_exact',
      summary: appointment.summary,
      startIso: appointment.slot.startIso,
      endIso: appointment.slot.endIso,
      status: appointment.status,
    };
  }

  private assertTenant(tenantId: string): void {
    if (tenantId !== this.tenantId) throw new Error('SOE/EXACT simulator tenant mismatch');
  }
}
