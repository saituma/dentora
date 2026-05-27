import {
  createGoogleCalendarAppointment,
  cancelGoogleCalendarAppointment,
  findGoogleCalendarAppointment,
  listUpcomingGoogleCalendarAppointments,
  rescheduleGoogleCalendarAppointment,
} from '../../../integrations/google-calendar-appointments.js';
import { findAvailableCalendarSlots } from '../../../integrations/google-calendar-availability.js';
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
import {
  SchedulingProviderCapabilityUnavailableError,
  SchedulingProviderTenantMismatchError,
} from '../../domain/errors.js';
import type { Patient } from '../../domain/patient.types.js';
import type { SchedulingProviderPort } from '../../ports/scheduling-provider.port.js';

export class GoogleCalendarSchedulingProvider implements SchedulingProviderPort {
  private readonly tenantId: string;

  public constructor(input: { tenantId: string }) {
    this.tenantId = input.tenantId;
  }

  public async listAppointments(params: ListAppointmentsParams): Promise<ListAppointmentsResult> {
    this.assertTenant(params.tenantId);
    const result = await listUpcomingGoogleCalendarAppointments(params);
    return {
      sourceId: result.calendarId,
      appointments: result.events.map((event) => ({
        id: event.eventId,
        provider: 'google_calendar',
        summary: event.summary,
        description: event.description,
        htmlLink: event.htmlLink,
        startIso: event.startIso,
        endIso: event.endIso,
        status: event.status,
      })),
    };
  }

  public async findAppointment(
    params: FindAppointmentParams,
  ): Promise<ExternalAppointmentSummary | null> {
    this.assertTenant(params.tenantId);
    const match = await findGoogleCalendarAppointment(params);
    if (!match) return null;

    return {
      id: match.eventId,
      provider: 'google_calendar',
      summary: match.summary,
      startIso: match.startIso,
      endIso: match.endIso,
      status: 'confirmed',
    };
  }

  public async getAvailability(params: AvailabilityParams): Promise<Slot[]> {
    this.assertTenant(params.tenantId);
    const availability = await findAvailableCalendarSlots(params);
    return availability.suggestedSlots;
  }

  public async createAppointment(params: CreateAppointmentParams): Promise<Appointment> {
    this.assertTenant(params.tenantId);
    const created = await createGoogleCalendarAppointment(params);
    return {
      id: created.eventId,
      tenantId: params.tenantId,
      provider: 'google_calendar',
      slot: created.slot,
      htmlLink: created.htmlLink,
      appAppointmentId: params.appAppointmentId,
    };
  }

  public async cancelAppointment(id: string): Promise<void> {
    await cancelGoogleCalendarAppointment({ tenantId: this.tenantId, eventId: id });
  }

  public async rescheduleAppointment(
    id: string,
    params: RescheduleAppointmentParams,
  ): Promise<Appointment> {
    this.assertTenant(params.tenantId);
    await rescheduleGoogleCalendarAppointment({
      tenantId: params.tenantId,
      eventId: id,
      appAppointmentId: params.appAppointmentId,
      timezone: params.timezone,
      slot: params.slot,
    });

    return {
      id,
      tenantId: params.tenantId,
      provider: 'google_calendar',
      slot: {
        ...params.slot,
        label: params.slot.startIso,
      },
      appAppointmentId: params.appAppointmentId,
    };
  }

  public async findPatient(_phone: string): Promise<Patient | null> {
    return null;
  }

  public async upsertPatient(_params: UpsertPatientParams): Promise<Patient> {
    throw new SchedulingProviderCapabilityUnavailableError('google_calendar', 'patient upsert');
  }

  public async validateCredentials(): Promise<void> {
    await this.healthCheck();
  }

  public async healthCheck(): Promise<ProviderHealthCheckResult> {
    await listUpcomingGoogleCalendarAppointments({
      tenantId: this.tenantId,
      days: 1,
      maxResults: 1,
    });
    return {
      provider: 'google_calendar',
      healthy: true,
      checkedAt: new Date().toISOString(),
    };
  }

  private assertTenant(tenantId: string): void {
    if (tenantId !== this.tenantId) {
      throw new SchedulingProviderTenantMismatchError('google_calendar');
    }
  }
}

export function createGoogleCalendarSchedulingProvider(input: {
  tenantId: string;
}): SchedulingProviderPort {
  return new GoogleCalendarSchedulingProvider(input);
}
