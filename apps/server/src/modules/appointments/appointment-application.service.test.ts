import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClinicProfile = vi.hoisted(() => vi.fn());
const mockGetBookingRules = vi.hoisted(() => vi.fn());
const mockFindAvailableCalendarSlots = vi.hoisted(() => vi.fn());
const mockGetActiveGoogleCalendarIntegration = vi.hoisted(() => vi.fn());
const mockCreateGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockCancelGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockRescheduleGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
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

vi.mock('../integrations/integration.service.js', () => ({
  findAvailableCalendarSlots: mockFindAvailableCalendarSlots,
  getActiveGoogleCalendarIntegration: mockGetActiveGoogleCalendarIntegration,
  createGoogleCalendarAppointment: mockCreateGoogleCalendarAppointment,
  cancelGoogleCalendarAppointment: mockCancelGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment: mockRescheduleGoogleCalendarAppointment,
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
  cancelLedgerBackedAppointment,
  rescheduleLedgerBackedAppointment,
} from './appointment-application.service.js';

const startIso = '2026-06-01T14:00:00.000Z';
const endIso = '2026-06-01T14:30:00.000Z';
const slot = { startIso, endIso };

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
  mockGetActiveGoogleCalendarIntegration.mockResolvedValue({ id: 'integration-a' });
  mockFindAvailableCalendarSlots.mockResolvedValue({
    exactMatch: { ...slot, label: 'June 1 at 2:00 PM' },
    suggestedSlots: [{ ...slot, label: 'June 1 at 2:00 PM' }],
  });
  mockUpsertPatientProfile.mockResolvedValue({ id: 'patient-a' });
  mockCreateAppointmentHold.mockResolvedValue({ id: 'hold-a' });
  mockConfirmAppointmentHold.mockResolvedValue({
    id: 'appointment-a',
    externalCalendarEventId: null,
  });
  mockCreateGoogleCalendarAppointment.mockResolvedValue({
    eventId: 'google-event-a',
    htmlLink: 'https://calendar.example/event-a',
    slot: { ...slot, label: 'June 1 at 2:00 PM' },
  });
  mockBeginAppointmentCancellationByExternalEventId.mockResolvedValue({ id: 'appointment-a' });
  mockBeginAppointmentRescheduleByExternalEventId.mockResolvedValue({ id: 'appointment-a' });
});

describe('appointment application service', () => {
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

    expect(mockFindAvailableCalendarSlots).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', requestedDate: '2026-06-01' }),
    );
    expect(mockCreateAppointmentHold).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', patientId: 'patient-a' }),
    );
    expect(mockConfirmAppointmentHold).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', holdId: 'hold-a' }),
    );
    expect(mockCreateGoogleCalendarAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        appAppointmentId: 'appointment-a',
        slot,
      }),
    );
    expect(mockConfirmAppointmentHold.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateGoogleCalendarAppointment.mock.invocationCallOrder[0],
    );
    expect(mockAttachExternalCalendarEvent).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointmentId: 'appointment-a',
      externalCalendarEventId: 'google-event-a',
    });
    expect(result).toMatchObject({
      eventId: 'google-event-a',
      appointmentId: 'appointment-a',
    });
  });

  it('does not create a patient, hold, or external event when availability is blocked', async () => {
    mockFindAvailableCalendarSlots.mockResolvedValueOnce({
      exactMatch: null,
      suggestedSlots: [],
    });

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
    expect(mockCreateGoogleCalendarAppointment).not.toHaveBeenCalled();
  });

  it('marks reconciliation when external cancellation fails after local cancellation', async () => {
    mockCancelGoogleCalendarAppointment.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(
      cancelLedgerBackedAppointment({ tenantId: 'tenant-a', eventId: 'google-event-a' }),
    ).rejects.toThrow('provider unavailable');

    expect(mockBeginAppointmentCancellationByExternalEventId).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      externalCalendarEventId: 'google-event-a',
    });
    expect(mockMarkAppointmentExternalSyncState).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointmentId: 'appointment-a',
      operation: 'cancel',
      status: 'local_cancelled_external_cancel_failed',
      reason: 'provider unavailable',
    });
  });

  it('marks reconciliation when external reschedule fails after local reschedule', async () => {
    mockRescheduleGoogleCalendarAppointment.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

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
    expect(mockMarkAppointmentExternalSyncState).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointmentId: 'appointment-a',
      operation: 'reschedule',
      status: 'local_rescheduled_external_reschedule_failed',
      reason: 'provider unavailable',
    });
  });
});
