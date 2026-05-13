import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClinicProfile = vi.hoisted(() => vi.fn());
const mockGetBookingRules = vi.hoisted(() => vi.fn());
const mockFindAvailableCalendarSlots = vi.hoisted(() => vi.fn());
const mockGetActiveGoogleCalendarIntegration = vi.hoisted(() => vi.fn());
const mockResolveValidGoogleAccessToken = vi.hoisted(() => vi.fn());
const mockFindPatientProfile = vi.hoisted(() => vi.fn());
const mockSendAppointmentSms = vi.hoisted(() => vi.fn());
const mockForwardCallToHuman = vi.hoisted(() => vi.fn());
const mockBookLedgerBackedAppointment = vi.hoisted(() => vi.fn());
const mockCancelLedgerBackedAppointment = vi.hoisted(() => vi.fn());
const mockRescheduleLedgerBackedAppointment = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../config/config.service.js', () => ({
  getClinicProfile: mockGetClinicProfile,
  getBookingRules: mockGetBookingRules,
}));

vi.mock('../integrations/integration.service.js', () => ({
  findAvailableCalendarSlots: mockFindAvailableCalendarSlots,
  getActiveGoogleCalendarIntegration: mockGetActiveGoogleCalendarIntegration,
}));

vi.mock('../integrations/google-calendar.shared.js', () => ({
  resolveValidGoogleAccessToken: mockResolveValidGoogleAccessToken,
}));

vi.mock('../patients/patients.service.js', () => ({
  findPatientProfile: mockFindPatientProfile,
}));

vi.mock('./telephony.service.js', () => ({
  forwardCallToHuman: mockForwardCallToHuman,
  sendAppointmentSms: mockSendAppointmentSms,
}));

vi.mock('../appointments/appointment-application.service.js', () => ({
  bookLedgerBackedAppointment: mockBookLedgerBackedAppointment,
  cancelLedgerBackedAppointment: mockCancelLedgerBackedAppointment,
  rescheduleLedgerBackedAppointment: mockRescheduleLedgerBackedAppointment,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: mockLogger,
}));

import { handleConvaiToolCall } from './convai-tools.js';

const startIso = '2026-06-01T14:00:00.000Z';
const endIso = '2026-06-01T14:30:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClinicProfile.mockResolvedValue({
    timezone: 'UTC',
    clinicName: 'Dental Clinic',
    businessHours: null,
  });
  mockGetBookingRules.mockResolvedValue({
    minNoticePeriodHours: 0,
    maxAdvanceBookingDays: 365,
    defaultAppointmentDurationMinutes: 30,
    bufferBetweenAppointmentsMinutes: 0,
    operatingSchedule: null,
    closedDates: [],
  });
  mockSendAppointmentSms.mockResolvedValue({ success: true });
  mockBookLedgerBackedAppointment.mockResolvedValue({
    eventId: 'google-event-a',
    appointmentId: 'appointment-a',
    htmlLink: 'https://calendar.example/event-a',
    slot: {
      startIso,
      endIso,
      label: 'June 1 at 2:00 PM',
    },
  });
  mockCancelLedgerBackedAppointment.mockResolvedValue({
    success: true,
    appointmentId: 'appointment-a',
  });
  mockRescheduleLedgerBackedAppointment.mockResolvedValue({
    success: true,
    appointmentId: 'appointment-a',
    slot: { startIso, endIso },
  });
  mockFindAvailableCalendarSlots.mockResolvedValue({
    exactMatch: {
      startIso,
      endIso,
      label: 'June 1 at 2:00 PM',
    },
    suggestedSlots: [
      {
        startIso,
        endIso,
        label: 'June 1 at 2:00 PM',
      },
    ],
  });
});

describe('ConvAI appointment tools', () => {
  it('books through the ledger-backed appointment flow and preserves response shape', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'create_appointment',
      callSessionId: 'call-session-a',
      params: {
        startIso,
        endIso,
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
        age: 34,
      },
    });

    expect(mockBookLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      slot: { startIso, endIso },
      summary: 'Dental appointment - Jane Secret',
      patient: {
        fullName: 'Jane Secret',
        age: 34,
        phoneNumber: '+15551234567',
        dateOfBirth: null,
        reasonForVisit: 'Cleaning',
      },
    });
    expect(result).toMatchObject({
      success: true,
      eventId: 'google-event-a',
      appointmentId: 'appointment-a',
      htmlLink: 'https://calendar.example/event-a',
      slot: { startIso, endIso, label: 'June 1 at 2:00 PM' },
    });
  });

  it('uses the shared ledger-aware availability service', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'check_availability',
      params: {
        requestedDate: '2026-06-01',
        requestedTime: '14:00',
        appointmentDurationMinutes: 30,
      },
    });

    expect(mockFindAvailableCalendarSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        timezone: 'UTC',
        requestedDate: '2026-06-01',
        requestedTime: '14:00',
      }),
    );
    expect(result).toMatchObject({
      exactMatch: { startIso, endIso },
      suggestedSlots: [{ startIso, endIso }],
      timezone: 'UTC',
    });
  });

  it('cancels through the ledger-backed cancellation flow', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'cancel_appointment',
      params: { eventId: 'google-event-a' },
    });

    expect(mockCancelLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
    });
    expect(result).toEqual({
      success: true,
      appointmentId: 'appointment-a',
      message: 'Appointment cancelled.',
    });
  });

  it('reschedules through the ledger-backed reschedule flow', async () => {
    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'reschedule_appointment',
      params: { eventId: 'google-event-a', startIso, endIso },
    });

    expect(mockRescheduleLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
      timezone: 'UTC',
      slot: { startIso, endIso },
    });
    expect(result).toEqual({
      success: true,
      appointmentId: 'appointment-a',
      slot: { startIso, endIso },
      message: 'Appointment rescheduled.',
    });
  });

  it('returns safe failure text when ledger-backed booking rejects', async () => {
    mockBookLedgerBackedAppointment.mockRejectedValueOnce(
      new Error('Google calendar failed for Jane Secret +15551234567'),
    );

    const result = await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'create_appointment',
      params: {
        startIso,
        endIso,
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
      },
    });

    expect(result).toEqual({
      success: false,
      message:
        'I could not book that appointment safely. Please try another time or contact the front desk.',
    });
    expect(JSON.stringify(result)).not.toContain('Jane Secret');
    expect(JSON.stringify(result)).not.toContain('+15551234567');
  });

  it('keeps tenant context scoped to the tool call', async () => {
    await handleConvaiToolCall({
      tenantId: 'tenant-b',
      toolName: 'cancel_appointment',
      params: { eventId: 'google-event-a' },
    });

    expect(mockCancelLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-b',
      eventId: 'google-event-a',
    });
  });

  it('does not log raw appointment PHI from tool parameters or provider failures', async () => {
    mockBookLedgerBackedAppointment.mockRejectedValueOnce(
      new Error('Raw provider failure for Jane Secret at +15551234567'),
    );

    await handleConvaiToolCall({
      tenantId: 'tenant-a',
      toolName: 'create_appointment',
      callSessionId: 'call-session-a',
      params: {
        startIso,
        endIso,
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
      },
    });

    const loggedPayload = JSON.stringify([
      mockLogger.info.mock.calls,
      mockLogger.warn.mock.calls,
      mockLogger.error.mock.calls,
    ]);
    expect(loggedPayload).not.toContain('Jane Secret');
    expect(loggedPayload).not.toContain('+15551234567');
    expect(loggedPayload).not.toContain('Raw provider failure');
  });
});
