import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClinicProfile = vi.hoisted(() => vi.fn());
const mockGetBookingRules = vi.hoisted(() => vi.fn());
const mockResolveActiveSchedulingProvider = vi.hoisted(() => vi.fn());
const mockResolveSchedulingProvider = vi.hoisted(() => vi.fn());
const mockProviderListAppointments = vi.hoisted(() => vi.fn());
const mockProviderFindAppointment = vi.hoisted(() => vi.fn());
const mockProviderGetAvailability = vi.hoisted(() => vi.fn());
const mockProviderCreateAppointment = vi.hoisted(() => vi.fn());
const mockProviderCancelAppointment = vi.hoisted(() => vi.fn());
const mockProviderRescheduleAppointment = vi.hoisted(() => vi.fn());
const mockProviderFindPatient = vi.hoisted(() => vi.fn());
const mockProviderUpsertPatient = vi.hoisted(() => vi.fn());
const mockProviderValidateCredentials = vi.hoisted(() => vi.fn());
const mockProviderHealthCheck = vi.hoisted(() => vi.fn());
const mockCreateExternalEntityMapping = vi.hoisted(() => vi.fn());
const mockUpsertPatientProfile = vi.hoisted(() => vi.fn());
const mockCreateAppointmentHold = vi.hoisted(() => vi.fn());
const mockConfirmAppointmentHold = vi.hoisted(() => vi.fn());
const mockAttachExternalCalendarEvent = vi.hoisted(() => vi.fn());
const mockMarkAppointmentReconciliationNeeded = vi.hoisted(() => vi.fn());
const mockBeginAppointmentCancellationByExternalEventId = vi.hoisted(() => vi.fn());
const mockBeginAppointmentRescheduleByExternalEventId = vi.hoisted(() => vi.fn());
const mockMarkAppointmentExternalSyncState = vi.hoisted(() => vi.fn());

vi.mock('../config/config.service.js', () => ({
  getClinicProfile: mockGetClinicProfile,
  getBookingRules: mockGetBookingRules,
}));

vi.mock('../pms/services/scheduling-provider-resolver.service.js', () => ({
  resolveActiveSchedulingProvider: mockResolveActiveSchedulingProvider,
  resolveSchedulingProvider: mockResolveSchedulingProvider,
}));

vi.mock('../pms/services/external-entity-mapping.service.js', () => ({
  createExternalEntityMapping: mockCreateExternalEntityMapping,
}));

vi.mock('../patients/patients.service.js', () => ({
  upsertPatientProfile: mockUpsertPatientProfile,
}));

vi.mock('./appointment-ledger.service.js', () => ({
  createAppointmentHold: mockCreateAppointmentHold,
  confirmAppointmentHold: mockConfirmAppointmentHold,
  attachExternalCalendarEvent: mockAttachExternalCalendarEvent,
  markAppointmentReconciliationNeeded: mockMarkAppointmentReconciliationNeeded,
  beginAppointmentCancellationByExternalEventId: mockBeginAppointmentCancellationByExternalEventId,
  beginAppointmentRescheduleByExternalEventId: mockBeginAppointmentRescheduleByExternalEventId,
  markAppointmentExternalSyncState: mockMarkAppointmentExternalSyncState,
}));

import {
  bookLedgerBackedAppointment,
  checkAppointmentAvailability,
  listUpcomingAppointments,
  cancelLedgerBackedAppointment,
  rescheduleLedgerBackedAppointment,
} from './appointment-application.service.js';

const startIso = '2026-06-01T14:00:00.000Z';
const endIso = '2026-06-01T14:30:00.000Z';
const slot = { startIso, endIso };
const slotWithLabel = { ...slot, label: 'June 1 at 2:00 PM' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClinicProfile.mockResolvedValue({
    timezone: 'UTC',
    businessHours: null,
  });
  mockGetBookingRules.mockResolvedValue({
    defaultAppointmentDurationMinutes: 30,
    bufferBetweenAppointmentsMinutes: 0,
    operatingSchedule: null,
    closedDates: [],
  });
  const provider = {
    listAppointments: mockProviderListAppointments,
    findAppointment: mockProviderFindAppointment,
    getAvailability: mockProviderGetAvailability,
    createAppointment: mockProviderCreateAppointment,
    cancelAppointment: mockProviderCancelAppointment,
    rescheduleAppointment: mockProviderRescheduleAppointment,
    findPatient: mockProviderFindPatient,
    upsertPatient: mockProviderUpsertPatient,
    validateCredentials: mockProviderValidateCredentials,
    healthCheck: mockProviderHealthCheck,
  };
  mockResolveActiveSchedulingProvider.mockResolvedValue({
    providerName: 'google_calendar',
    integrationId: 'integration-a',
    provider,
  });
  mockResolveSchedulingProvider.mockReturnValue(provider);
  mockProviderListAppointments.mockResolvedValue({
    sourceId: 'primary',
    appointments: [
      {
        id: 'google-event-a',
        provider: 'google_calendar',
        summary: 'Appointment',
        description: '',
        htmlLink: 'https://calendar.example/event-a',
        startIso,
        endIso,
        status: 'confirmed',
      },
    ],
  });
  mockProviderGetAvailability.mockResolvedValue([slotWithLabel]);
  mockUpsertPatientProfile.mockResolvedValue({ id: 'patient-a' });
  mockCreateAppointmentHold.mockResolvedValue({ id: 'hold-a' });
  mockConfirmAppointmentHold.mockResolvedValue({
    id: 'appointment-a',
    externalCalendarEventId: null,
  });
  mockProviderCreateAppointment.mockResolvedValue({
    id: 'google-event-a',
    tenantId: 'tenant-a',
    provider: 'google_calendar',
    htmlLink: 'https://calendar.example/event-a',
    slot: slotWithLabel,
  });
  mockBeginAppointmentCancellationByExternalEventId.mockResolvedValue({ id: 'appointment-a' });
  mockBeginAppointmentRescheduleByExternalEventId.mockResolvedValue({ id: 'appointment-a' });
});

describe('appointment application service', () => {
  it('lists upcoming appointments through the resolved provider', async () => {
    const result = await listUpcomingAppointments({ tenantId: 'tenant-a', days: 7 });

    expect(mockResolveActiveSchedulingProvider).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      operation: 'read',
    });
    expect(mockProviderListAppointments).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      days: 7,
      maxResults: 50,
    });
    expect(result).toEqual({
      calendarId: 'primary',
      events: [
        {
          id: 'google-event-a',
          summary: 'Appointment',
          description: '',
          htmlLink: 'https://calendar.example/event-a',
          start: startIso,
          end: endIso,
          status: 'confirmed',
        },
      ],
    });
  });

  it('checks availability through the resolved provider', async () => {
    const result = await checkAppointmentAvailability({
      tenantId: 'tenant-a',
      requestedDate: '2026-06-01',
      requestedTime: '14:00',
      appointmentDurationMinutes: 30,
    });

    expect(mockResolveActiveSchedulingProvider).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      operation: 'read',
    });
    expect(mockProviderGetAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        requestedDate: '2026-06-01',
        requestedTime: '14:00',
      }),
    );
    expect(result).toMatchObject({
      exactMatch: slotWithLabel,
      suggestedSlots: [slotWithLabel],
      timezone: 'UTC',
    });
  });

  it('creates the local ledger appointment before creating the external calendar event', async () => {
    const result = await bookLedgerBackedAppointment({
      tenantId: 'tenant-a',
      slot,
      patient: {
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
      },
    });

    expect(mockProviderGetAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', requestedDate: '2026-06-01' }),
    );
    expect(mockCreateAppointmentHold).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        patientId: 'patient-a',
        calendarIntegrationId: 'integration-a',
      }),
    );
    expect(mockConfirmAppointmentHold).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', holdId: 'hold-a' }),
    );
    expect(mockProviderCreateAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        appAppointmentId: 'appointment-a',
        slot,
      }),
    );
    expect(mockConfirmAppointmentHold.mock.invocationCallOrder[0]).toBeLessThan(
      mockProviderCreateAppointment.mock.invocationCallOrder[0],
    );
    expect(mockAttachExternalCalendarEvent).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointmentId: 'appointment-a',
      externalCalendarEventId: 'google-event-a',
      externalProvider: 'google_calendar',
      externalAppointmentId: 'google-event-a',
    });
    expect(mockCreateExternalEntityMapping).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      localEntityType: 'appointment',
      localEntityId: 'appointment-a',
      externalProvider: 'google_calendar',
      externalEntityType: 'appointment',
      externalEntityId: 'google-event-a',
      integrationId: 'integration-a',
      metadata: { legacyExternalCalendarEventId: 'google-event-a' },
    });
    expect(result).toMatchObject({
      eventId: 'google-event-a',
      appointmentId: 'appointment-a',
    });
  });

  it('does not create a patient, hold, or external event when availability is blocked', async () => {
    mockProviderGetAvailability.mockResolvedValueOnce([]);

    await expect(
      bookLedgerBackedAppointment({
        tenantId: 'tenant-a',
        slot,
        patient: {
          fullName: 'Jane Secret',
          phoneNumber: '+15551234567',
          reasonForVisit: 'Cleaning',
        },
      }),
    ).rejects.toThrow('Appointment slot is no longer available');

    expect(mockUpsertPatientProfile).not.toHaveBeenCalled();
    expect(mockCreateAppointmentHold).not.toHaveBeenCalled();
    expect(mockProviderCreateAppointment).not.toHaveBeenCalled();
  });

  it('marks reconciliation when external cancellation fails after local cancellation', async () => {
    mockProviderCancelAppointment.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(
      cancelLedgerBackedAppointment({ tenantId: 'tenant-a', eventId: 'google-event-a' }),
    ).rejects.toThrow('provider unavailable');

    expect(mockBeginAppointmentCancellationByExternalEventId).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      externalCalendarEventId: 'google-event-a',
    });
    expect(mockResolveActiveSchedulingProvider).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      operation: 'write',
    });
    expect(mockProviderCancelAppointment).toHaveBeenCalledWith('google-event-a');
    expect(mockMarkAppointmentExternalSyncState).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointmentId: 'appointment-a',
      operation: 'cancel',
      status: 'local_cancelled_external_cancel_failed',
      reason: 'provider unavailable',
    });
  });

  it('cancels through the resolved scheduling provider', async () => {
    const result = await cancelLedgerBackedAppointment({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
    });

    expect(mockResolveActiveSchedulingProvider).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      operation: 'write',
    });
    expect(mockProviderCancelAppointment).toHaveBeenCalledWith('google-event-a');
    expect(mockMarkAppointmentExternalSyncState).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointmentId: 'appointment-a',
      operation: 'cancel',
      status: 'external_cancel_synced',
    });
    expect(result).toEqual({ success: true, appointmentId: 'appointment-a' });
  });

  it('marks reconciliation when external reschedule fails after local reschedule', async () => {
    mockProviderRescheduleAppointment.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(
      rescheduleLedgerBackedAppointment({
        tenantId: 'tenant-a',
        eventId: 'google-event-a',
        timezone: 'UTC',
        slot,
      }),
    ).rejects.toThrow('provider unavailable');

    expect(mockBeginAppointmentRescheduleByExternalEventId).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      externalCalendarEventId: 'google-event-a',
      startAt: new Date(startIso),
      endAt: new Date(endIso),
      timezone: 'UTC',
    });
    expect(mockResolveActiveSchedulingProvider).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      operation: 'write',
    });
    expect(mockProviderRescheduleAppointment).toHaveBeenCalledWith('google-event-a', {
      tenantId: 'tenant-a',
      appAppointmentId: 'appointment-a',
      timezone: 'UTC',
      slot,
    });
    expect(mockMarkAppointmentExternalSyncState).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointmentId: 'appointment-a',
      operation: 'reschedule',
      status: 'local_rescheduled_external_reschedule_failed',
      reason: 'provider unavailable',
    });
  });

  it('reschedules through the resolved scheduling provider', async () => {
    const result = await rescheduleLedgerBackedAppointment({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
      timezone: 'UTC',
      slot,
    });

    expect(mockResolveActiveSchedulingProvider).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      operation: 'write',
    });
    expect(mockProviderRescheduleAppointment).toHaveBeenCalledWith('google-event-a', {
      tenantId: 'tenant-a',
      appAppointmentId: 'appointment-a',
      timezone: 'UTC',
      slot,
    });
    expect(mockMarkAppointmentExternalSyncState).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointmentId: 'appointment-a',
      operation: 'reschedule',
      status: 'external_reschedule_synced',
    });
    expect(result).toEqual({
      success: true,
      appointmentId: 'appointment-a',
      slot,
    });
  });
});
