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
import {
  UnsupportedProviderOperationError,
  VendorAccessRequiredError,
} from '../../domain/errors.js';
import type { SchedulingProviderPort } from '../../ports/scheduling-provider.port.js';
import { CsR4PlusNotConfiguredError } from './cs-r4-plus.errors.js';

export function isCsR4PlusFeatureEnabled(): boolean {
  return process.env.ENABLE_CS_R4_PLUS === 'true';
}

export class CsR4PlusSchedulingProvider implements SchedulingProviderPort {
  private readonly tenantId: string;
  private readonly integrationId?: string;

  public constructor(input: { tenantId: string; integrationId?: string }) {
    this.tenantId = input.tenantId;
    this.integrationId = input.integrationId;
  }

  public async listAppointments(_params: ListAppointmentsParams): Promise<ListAppointmentsResult> {
    this.requireVendorAccess('appointment read');
  }

  public async findAppointment(
    _params: FindAppointmentParams,
  ): Promise<ExternalAppointmentSummary | null> {
    this.requireVendorAccess('appointment lookup');
  }

  public async getAvailability(_params: AvailabilityParams): Promise<Slot[]> {
    this.requireVendorAccess('availability query');
  }

  public async createAppointment(_params: CreateAppointmentParams): Promise<Appointment> {
    this.requireVendorAccess('appointment create');
  }

  public async cancelAppointment(_id: string): Promise<void> {
    this.requireVendorAccess('appointment cancel');
  }

  public async rescheduleAppointment(
    _id: string,
    _params: RescheduleAppointmentParams,
  ): Promise<Appointment> {
    this.requireVendorAccess('appointment reschedule');
  }

  public async findPatient(_phone: string): Promise<Patient | null> {
    this.requireVendorAccess('patient lookup');
  }

  public async upsertPatient(_params: UpsertPatientParams): Promise<Patient> {
    throw new UnsupportedProviderOperationError('cs_r4_plus', 'patient upsert');
  }

  public async validateCredentials(): Promise<void> {
    this.requireVendorAccess('credential validation');
  }

  public async healthCheck(): Promise<ProviderHealthCheckResult> {
    this.requireVendorAccess('health check');
  }

  private requireVendorAccess(requirement: string): never {
    if (!isCsR4PlusFeatureEnabled()) {
      throw new CsR4PlusNotConfiguredError();
    }
    throw new VendorAccessRequiredError(
      'cs_r4_plus',
      `${requirement} requires official CS R4+ vendor API docs, auth, and sandbox access`,
    );
  }

  public get debugContext(): { tenantId: string; integrationId?: string } {
    return { tenantId: this.tenantId, integrationId: this.integrationId };
  }
}

export function createCsR4PlusSchedulingProvider(input: {
  tenantId: string;
  integrationId?: string;
}): SchedulingProviderPort {
  if (!isCsR4PlusFeatureEnabled()) {
    throw new CsR4PlusNotConfiguredError();
  }
  return new CsR4PlusSchedulingProvider(input);
}
