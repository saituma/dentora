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
import { SoeExactNotConfiguredError } from './soe-exact.errors.js';

export function isSoeExactFeatureEnabled(): boolean {
  return process.env.ENABLE_SOE_EXACT === 'true';
}

export class SoeExactSchedulingProvider implements SchedulingProviderPort {
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
    throw new UnsupportedProviderOperationError('soe_exact', 'patient upsert');
  }

  public async validateCredentials(): Promise<void> {
    this.requireVendorAccess('credential validation');
  }

  public async healthCheck(): Promise<ProviderHealthCheckResult> {
    this.requireVendorAccess('health check');
  }

  private requireVendorAccess(requirement: string): never {
    if (!isSoeExactFeatureEnabled()) {
      throw new SoeExactNotConfiguredError();
    }
    throw new VendorAccessRequiredError(
      'soe_exact',
      `${requirement} requires official SOE/EXACT vendor API docs, auth, and sandbox access`,
    );
  }

  public get debugContext(): { tenantId: string; integrationId?: string } {
    return { tenantId: this.tenantId, integrationId: this.integrationId };
  }
}

export function createSoeExactSchedulingProvider(input: {
  tenantId: string;
  integrationId?: string;
}): SchedulingProviderPort {
  if (!isSoeExactFeatureEnabled()) {
    throw new SoeExactNotConfiguredError();
  }
  return new SoeExactSchedulingProvider(input);
}
