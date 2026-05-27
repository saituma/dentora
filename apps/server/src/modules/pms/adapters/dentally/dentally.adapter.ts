import { listLedgerAvailabilityBlockers } from '../../../appointments/appointment-ledger.service.js';
import {
  formatDateInTimeZone,
  formatTimeInTimeZone,
  makeDateInTimeZone,
} from '../../../appointments/appointment-timezone.js';
import { createExternalEntityMapping } from '../../services/external-entity-mapping.service.js';
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
import { SchedulingProviderTenantMismatchError } from '../../domain/errors.js';
import type { Patient } from '../../domain/patient.types.js';
import type { SchedulingProviderPort } from '../../ports/scheduling-provider.port.js';
import { DentallyClient } from './dentally.client.js';
import {
  mapDentallyAppointment,
  mapDentallyAppointmentToSlot,
  mapDentallyAppointmentSummary,
  mapDentallyPatient,
} from './dentally.mapper.js';
import { DentallyApiError } from './dentally.errors.js';

type ScheduleEntry = { start: string; end: string; breaks: Array<{ start: string; end: string }> };

function normalizeScheduleEntry(
  schedule: Record<string, unknown> | null | undefined,
  dayKey: string,
): ScheduleEntry | null {
  if (!schedule || typeof schedule !== 'object') return null;
  const rawEntry = schedule[dayKey];
  if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return null;
  const entry = rawEntry as Record<string, unknown>;
  const start = typeof entry.start === 'string' ? entry.start.trim() : '';
  const end = typeof entry.end === 'string' ? entry.end.trim() : '';
  if (!start || !end) return null;

  const breaks = Array.isArray(entry.breaks)
    ? entry.breaks
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object' && !Array.isArray(item)),
        )
        .map((item) => ({
          start: typeof item.start === 'string' ? item.start.trim() : '',
          end: typeof item.end === 'string' ? item.end.trim() : '',
        }))
        .filter((item) => item.start && item.end)
    : [];

  const breakStart = typeof entry.breakStart === 'string' ? entry.breakStart.trim() : '';
  const breakEnd = typeof entry.breakEnd === 'string' ? entry.breakEnd.trim() : '';
  if (breaks.length === 0 && breakStart && breakEnd) {
    breaks.push({ start: breakStart, end: breakEnd });
  }

  return { start, end, breaks };
}

function parseTimeString(value?: string | null): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function dayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  })
    .format(date)
    .toLowerCase();
}

function slotLabel(startIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startIso));
}

function overlapsRange(
  startMs: number,
  endMs: number,
  busyIntervals: Array<{ startMs: number; endMs: number }>,
): boolean {
  return busyIntervals.some((busy) => startMs < busy.endMs && endMs > busy.startMs);
}

function slotMatchesRequestedPeriod(
  date: Date,
  timezone: string,
  period?: 'morning' | 'afternoon' | 'evening' | null,
): boolean {
  if (!period) return true;
  const hour = Number(formatTimeInTimeZone(date, timezone).slice(0, 2));
  if (period === 'morning') return hour >= 8 && hour < 12;
  if (period === 'afternoon') return hour >= 12 && hour < 17;
  return hour >= 17 || hour < 8;
}

function closedDateSet(closedDates?: string[] | null): Set<string> {
  return new Set((closedDates ?? []).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
}

function splitName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export class DentallySchedulingProvider implements SchedulingProviderPort {
  private readonly tenantId: string;
  private readonly integrationId?: string;

  public constructor(input: { tenantId: string; integrationId?: string }) {
    this.tenantId = input.tenantId;
    this.integrationId = input.integrationId;
  }

  public async listAppointments(params: ListAppointmentsParams): Promise<ListAppointmentsResult> {
    this.assertTenant(params.tenantId);
    const client = await this.client();
    const now = params.now ?? new Date();
    const days = Math.max(1, params.days ?? 7);
    const appointments = await client.listAppointments({
      startIso: now.toISOString(),
      endIso: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
      limit: params.maxResults ?? 50,
    });

    return {
      sourceId: client.integrationId,
      appointments: appointments.map((appointment) =>
        mapDentallyAppointmentSummary(appointment, 'UTC'),
      ),
    };
  }

  public async findAppointment(
    params: FindAppointmentParams,
  ): Promise<ExternalAppointmentSummary | null> {
    this.assertTenant(params.tenantId);
    const client = await this.client();
    const range = this.appointmentSearchRange(params);
    const appointments = await client.listAppointments({
      startIso: range.startIso,
      endIso: range.endIso,
      limit: 100,
    });
    const patientIds = params.phoneNumber
      ? new Set(
          (await client.listPatientsByPhone(params.phoneNumber))
            .map((patient) => String(patient.id))
            .filter(Boolean),
        )
      : null;
    const patientName = params.patientName?.trim().toLowerCase();
    const requestedTime = parseTimeString(params.appointmentTime ?? null);

    const match = appointments
      .filter((appointment) => {
        if (
          patientIds &&
          !patientIds.has(String(appointment.patient_id ?? appointment.patient?.id ?? ''))
        ) {
          return false;
        }
        if (patientName) {
          const mappedPatient = appointment.patient
            ? mapDentallyPatient(appointment.patient)
            : null;
          if (!mappedPatient?.fullName?.toLowerCase().includes(patientName)) return false;
        }
        return true;
      })
      .sort((left, right) => {
        if (!requestedTime) {
          return (
            new Date(mapDentallyAppointmentSummary(left, params.timezone).startIso).getTime() -
            new Date(mapDentallyAppointmentSummary(right, params.timezone).startIso).getTime()
          );
        }
        const leftStart = new Date(mapDentallyAppointmentSummary(left, params.timezone).startIso);
        const rightStart = new Date(mapDentallyAppointmentSummary(right, params.timezone).startIso);
        const leftTime = parseTimeString(formatTimeInTimeZone(leftStart, params.timezone));
        const rightTime = parseTimeString(formatTimeInTimeZone(rightStart, params.timezone));
        const target = requestedTime.hour * 60 + requestedTime.minute;
        const leftScore = leftTime ? Math.abs(leftTime.hour * 60 + leftTime.minute - target) : 0;
        const rightScore = rightTime
          ? Math.abs(rightTime.hour * 60 + rightTime.minute - target)
          : 0;
        return leftScore - rightScore;
      })[0];

    return match ? mapDentallyAppointmentSummary(match, params.timezone) : null;
  }

  public async getAvailability(params: AvailabilityParams): Promise<Slot[]> {
    this.assertTenant(params.tenantId);
    const client = await this.client();
    const requestedDate = params.requestedDate.trim();
    const durationMinutes = Math.max(5, params.appointmentDurationMinutes || 30);
    const bufferMinutes = Math.max(0, params.bufferBetweenAppointmentsMinutes || 0);
    const slotStepMinutes = durationMinutes + bufferMinutes;
    const maxSlots = Math.max(1, params.maxSlots || 3);
    const lookAheadDays = Math.max(1, params.lookAheadDays || 7);
    const [year, month, day] = requestedDate.split('-').map(Number);
    const rangeStart = makeDateInTimeZone(params.timezone, year, month, day, 0, 0);
    const rangeEnd = new Date(rangeStart.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);
    const earliestStartMs = Math.max(Date.now(), params.minimumStartAt?.getTime() ?? 0);

    const [dentallyAppointments, ledgerBlockers] = await Promise.all([
      client.listAppointments({
        startIso: rangeStart.toISOString(),
        endIso: rangeEnd.toISOString(),
        limit: 250,
      }),
      listLedgerAvailabilityBlockers({
        tenantId: params.tenantId,
        from: rangeStart,
        to: rangeEnd,
      }),
    ]);

    const practitionerIds = Array.isArray((params as { practitionerIds?: unknown }).practitionerIds)
      ? ((params as { practitionerIds?: unknown }).practitionerIds as unknown[])
          .map((id) => String(id).trim())
          .filter(Boolean)
      : [];
    if (practitionerIds.length > 0) {
      const availabilitySlots = await client.getAvailability({
        start_time: rangeStart.toISOString(),
        finish_time: rangeEnd.toISOString(),
        practitioner_ids: practitionerIds,
        duration: durationMinutes,
      });
      return availabilitySlots
        .map((availabilitySlot) =>
          mapDentallyAppointmentToSlot(
            {
              id: `${availabilitySlot.start_time ?? availabilitySlot.start}`,
              start_time: availabilitySlot.start_time ?? availabilitySlot.start,
              finish_time: availabilitySlot.finish_time ?? availabilitySlot.end,
            },
            params.timezone,
          ),
        )
        .slice(0, maxSlots);
    }

    const busyIntervals = [
      ...dentallyAppointments
        .filter((appointment) => !appointment.cancelled && appointment.status !== 'cancelled')
        .map((appointment) => {
          const slot = mapDentallyAppointmentSummary(appointment, params.timezone);
          return {
            startMs: new Date(slot.startIso).getTime(),
            endMs: new Date(slot.endIso).getTime(),
          };
        })
        .filter(
          (interval) => Number.isFinite(interval.startMs) && interval.endMs > interval.startMs,
        ),
      ...ledgerBlockers.map((blocker) => ({
        startMs: blocker.startAt.getTime(),
        endMs: blocker.endAt.getTime(),
      })),
    ];

    const closedDates = closedDateSet(params.closedDates);
    const requestedTime = parseTimeString(params.requestedTime);
    const suggestedSlots: Slot[] = [];

    for (
      let offsetDays = 0;
      offsetDays < lookAheadDays && suggestedSlots.length < maxSlots;
      offsetDays += 1
    ) {
      const candidateDay = new Date(rangeStart.getTime() + offsetDays * 24 * 60 * 60 * 1000);
      const candidateDate = formatDateInTimeZone(candidateDay, params.timezone);
      if (closedDates.has(candidateDate)) continue;
      const schedule = normalizeScheduleEntry(
        params.operatingSchedule,
        dayKey(candidateDay, params.timezone),
      );
      if (!schedule) continue;
      const startTime = parseTimeString(schedule.start);
      const endTime = parseTimeString(schedule.end);
      if (!startTime || !endTime) continue;

      const openAt = makeDateInTimeZone(
        params.timezone,
        Number(candidateDate.slice(0, 4)),
        Number(candidateDate.slice(5, 7)),
        Number(candidateDate.slice(8, 10)),
        startTime.hour,
        startTime.minute,
      );
      const closeAt = makeDateInTimeZone(
        params.timezone,
        Number(candidateDate.slice(0, 4)),
        Number(candidateDate.slice(5, 7)),
        Number(candidateDate.slice(8, 10)),
        endTime.hour,
        endTime.minute,
      );
      const breakIntervals = schedule.breaks
        .map((period) => {
          const breakStart = parseTimeString(period.start);
          const breakEnd = parseTimeString(period.end);
          if (!breakStart || !breakEnd) return null;
          return {
            startMs: makeDateInTimeZone(
              params.timezone,
              Number(candidateDate.slice(0, 4)),
              Number(candidateDate.slice(5, 7)),
              Number(candidateDate.slice(8, 10)),
              breakStart.hour,
              breakStart.minute,
            ).getTime(),
            endMs: makeDateInTimeZone(
              params.timezone,
              Number(candidateDate.slice(0, 4)),
              Number(candidateDate.slice(5, 7)),
              Number(candidateDate.slice(8, 10)),
              breakEnd.hour,
              breakEnd.minute,
            ).getTime(),
          };
        })
        .filter((interval): interval is { startMs: number; endMs: number } =>
          Boolean(interval && interval.startMs < interval.endMs),
        );

      for (
        let slotStart = new Date(openAt);
        slotStart.getTime() + durationMinutes * 60_000 <= closeAt.getTime();
        slotStart = new Date(slotStart.getTime() + slotStepMinutes * 60_000)
      ) {
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
        const occupancyEnd = new Date(slotEnd.getTime() + bufferMinutes * 60_000);
        if (slotStart.getTime() < earliestStartMs) continue;
        if (overlapsRange(slotStart.getTime(), slotEnd.getTime(), breakIntervals)) continue;
        if (overlapsRange(slotStart.getTime(), occupancyEnd.getTime(), busyIntervals)) continue;
        if (!slotMatchesRequestedPeriod(slotStart, params.timezone, params.requestedPeriod))
          continue;
        if (
          requestedTime &&
          candidateDate === requestedDate &&
          formatTimeInTimeZone(slotStart, params.timezone) !==
            `${String(requestedTime.hour).padStart(2, '0')}:${String(requestedTime.minute).padStart(2, '0')}`
        ) {
          continue;
        }
        suggestedSlots.push({
          startIso: slotStart.toISOString(),
          endIso: slotEnd.toISOString(),
          label: slotLabel(slotStart.toISOString(), params.timezone),
        });
        if (suggestedSlots.length >= maxSlots) break;
      }
    }

    return suggestedSlots;
  }

  public async createAppointment(params: CreateAppointmentParams): Promise<Appointment> {
    this.assertTenant(params.tenantId);
    const client = await this.client();
    const patient = await this.upsertPatient({
      tenantId: params.tenantId,
      patient: params.patient,
    });
    if (!patient.externalId) {
      throw new DentallyApiError(
        'Dentally patient upsert did not return an external patient id',
        502,
      );
    }

    const created = await client.createAppointment({
      patient_id: patient.externalId,
      start_time: params.slot.startIso,
      finish_time: params.slot.endIso,
      reason: params.patient.reasonForVisit,
      notes: params.summary,
    });
    const appointment = mapDentallyAppointment(created, {
      tenantId: params.tenantId,
      timezone: params.timezone,
      appAppointmentId: params.appAppointmentId,
    });

    if (params.appAppointmentId) {
      await createExternalEntityMapping({
        tenantId: params.tenantId,
        localEntityType: 'appointment',
        localEntityId: params.appAppointmentId,
        externalProvider: 'dentally',
        externalEntityType: 'appointment',
        externalEntityId: appointment.id,
        integrationId: client.integrationId,
        metadata: { externalPatientId: patient.externalId },
      });
    }

    return {
      ...appointment,
      patient,
      externalPatientId: patient.externalId,
    };
  }

  public async cancelAppointment(id: string): Promise<void> {
    const client = await this.client();
    await client.cancelAppointment(id);
  }

  public async rescheduleAppointment(
    id: string,
    params: RescheduleAppointmentParams,
  ): Promise<Appointment> {
    this.assertTenant(params.tenantId);
    const client = await this.client();
    const updated = await client.updateAppointment(id, {
      start_time: params.slot.startIso,
      finish_time: params.slot.endIso,
    });
    const appointment = mapDentallyAppointment(updated, {
      tenantId: params.tenantId,
      timezone: params.timezone,
      appAppointmentId: params.appAppointmentId,
    });

    if (params.appAppointmentId) {
      await createExternalEntityMapping({
        tenantId: params.tenantId,
        localEntityType: 'appointment',
        localEntityId: params.appAppointmentId,
        externalProvider: 'dentally',
        externalEntityType: 'appointment',
        externalEntityId: appointment.id,
        integrationId: client.integrationId,
        metadata: { operation: 'reschedule' },
      });
    }

    return appointment;
  }

  public async findPatient(phone: string): Promise<Patient | null> {
    const client = await this.client();
    const [patient] = await client.listPatientsByPhone(phone);
    return patient ? mapDentallyPatient(patient) : null;
  }

  public async upsertPatient(params: UpsertPatientParams): Promise<Patient> {
    this.assertTenant(params.tenantId);
    const client = await this.client();
    const existing = await client.listPatientsByPhone(params.patient.phoneNumber);
    const { firstName, lastName } = splitName(params.patient.fullName);
    const payload = {
      first_name: firstName,
      last_name: lastName,
      preferred_name: params.patient.fullName,
      home_phone: params.patient.phoneNumber,
      mobile_phone: params.patient.phoneNumber,
      date_of_birth: params.patient.dateOfBirth ?? undefined,
      metadata: params.patient.reasonForVisit
        ? { reasonForVisit: params.patient.reasonForVisit }
        : undefined,
    };
    const saved = existing[0]
      ? await client.updatePatient(String(existing[0].id), payload)
      : await client.createPatient(payload);
    return mapDentallyPatient(saved);
  }

  public async validateCredentials(): Promise<void> {
    const client = await this.client();
    await client.validateCredentials();
  }

  public async healthCheck(): Promise<ProviderHealthCheckResult> {
    const client = await this.client();
    await client.healthCheck();
    return {
      provider: 'dentally',
      healthy: true,
      checkedAt: new Date().toISOString(),
    };
  }

  private async client(): Promise<DentallyClient> {
    return await DentallyClient.forTenant({
      tenantId: this.tenantId,
      integrationId: this.integrationId,
    });
  }

  private appointmentSearchRange(params: FindAppointmentParams): {
    startIso: string;
    endIso: string;
  } {
    if (params.appointmentDate) {
      const [year, month, day] = params.appointmentDate.split('-').map(Number);
      const start = makeDateInTimeZone(params.timezone, year, month, day, 0, 0);
      return {
        startIso: start.toISOString(),
        endIso: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    const now = new Date();
    return {
      startIso: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      endIso: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  private assertTenant(tenantId: string): void {
    if (tenantId !== this.tenantId) {
      throw new SchedulingProviderTenantMismatchError('dentally');
    }
  }
}

export function createDentallySchedulingProvider(input: {
  tenantId: string;
  integrationId?: string;
}): SchedulingProviderPort {
  return new DentallySchedulingProvider(input);
}
