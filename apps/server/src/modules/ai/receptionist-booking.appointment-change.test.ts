import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAIContext } from './ai.service.js';
import type { AppointmentChangeState } from './receptionist-booking.types.js';

const mockExecuteLlmWithFailover = vi.hoisted(() => vi.fn());
const mockResolveVerifiedAppointmentForCaller = vi.hoisted(() => vi.fn());
const mockGetAppointmentToolReadinessFailure = vi.hoisted(() => vi.fn());
const mockCancelLedgerBackedAppointment = vi.hoisted(() => vi.fn());
const mockRescheduleLedgerBackedAppointment = vi.hoisted(() => vi.fn());
const mockFindAvailableCalendarSlots = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('./engine/index.js', () => ({
  executeLlmWithFailover: mockExecuteLlmWithFailover,
}));

vi.mock('../appointments/appointment-lookup.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../appointments/appointment-lookup.service.js')>();
  return {
    ...actual,
    resolveVerifiedAppointmentForCaller: mockResolveVerifiedAppointmentForCaller,
  };
});

vi.mock('../appointments/appointment-tool-readiness.js', () => ({
  getAppointmentToolReadinessFailure: mockGetAppointmentToolReadinessFailure,
}));

vi.mock('../appointments/appointment-application.service.js', () => ({
  cancelLedgerBackedAppointment: mockCancelLedgerBackedAppointment,
  rescheduleLedgerBackedAppointment: mockRescheduleLedgerBackedAppointment,
}));

vi.mock('../integrations/integration.service.js', () => ({
  findAvailableCalendarSlots: mockFindAvailableCalendarSlots,
  findGoogleCalendarAppointment: vi.fn(() => {
    throw new Error('Google Calendar summary lookup should not be called');
  }),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: mockLogger,
}));

import {
  APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE,
  APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
} from '../appointments/appointment-lookup.service.js';
import { handleAppointmentChangeTurn } from './receptionist-booking.appointment-change.js';

const context: TenantAIContext = {
  tenantId: 'tenant-a',
  configVersion: 1,
  clinicName: 'Bright Dental',
  clinic: { timezone: 'UTC', clinicName: 'Bright Dental' },
  services: [],
  bookingRules: {
    defaultAppointmentDurationMinutes: 30,
    bufferBetweenAppointmentsMinutes: 0,
    operatingSchedule: null,
    closedDates: [],
  },
  policies: [],
  voiceProfile: {},
  faqs: [],
};

function changeState(overrides: Partial<AppointmentChangeState>): AppointmentChangeState {
  return {
    active: true,
    mode: 'cancel',
    status: 'awaiting_confirmation',
    confirmationRequested: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAppointmentToolReadinessFailure.mockResolvedValue(null);
  mockExecuteLlmWithFailover.mockResolvedValue({
    content: JSON.stringify({
      confirmed: true,
      declined: false,
    }),
  });
  mockResolveVerifiedAppointmentForCaller.mockResolvedValue({
    success: true,
    appointment: { id: 'appointment-a' },
    externalCalendarEventId: 'google-event-a',
  });
  mockCancelLedgerBackedAppointment.mockResolvedValue({
    success: true,
    appointmentId: 'appointment-a',
  });
  mockRescheduleLedgerBackedAppointment.mockResolvedValue({
    success: true,
    appointmentId: 'appointment-a',
    slot: {
      startIso: '2026-06-02T15:00:00.000Z',
      endIso: '2026-06-02T15:30:00.000Z',
    },
  });
  mockFindAvailableCalendarSlots.mockResolvedValue({
    exactMatch: {
      startIso: '2026-06-02T15:00:00.000Z',
      endIso: '2026-06-02T15:30:00.000Z',
      label: 'June 2 at 3:00 PM',
    },
    suggestedSlots: [
      {
        startIso: '2026-06-02T15:00:00.000Z',
        endIso: '2026-06-02T15:30:00.000Z',
        label: 'June 2 at 3:00 PM',
      },
    ],
  });
});

describe('AI appointment change verification', () => {
  it('does not expose appointment details when checking with phone only', async () => {
    const response = await handleAppointmentChangeTurn({
      tenantId: 'tenant-a',
      context,
      userMessage: 'yes',
      detectedMode: null,
      state: changeState({
        mode: 'check',
        phoneNumber: '+15551234567',
      }),
    });

    expect(response).toBe(APPOINTMENT_VERIFICATION_CLARIFICATION_MESSAGE);
    expect(mockResolveVerifiedAppointmentForCaller).not.toHaveBeenCalled();
    expect(mockCancelLedgerBackedAppointment).not.toHaveBeenCalled();
    expect(mockRescheduleLedgerBackedAppointment).not.toHaveBeenCalled();
  });

  it('cancels using a verified local ledger appointment identifier', async () => {
    const response = await handleAppointmentChangeTurn({
      tenantId: 'tenant-a',
      context,
      userMessage: 'yes',
      detectedMode: null,
      state: changeState({
        mode: 'cancel',
        confirmationId: 'appointment-a',
      }),
    });

    expect(mockResolveVerifiedAppointmentForCaller).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      confirmationId: 'appointment-a',
      phoneNumber: undefined,
      dateOfBirth: undefined,
      appointmentDate: undefined,
      appointmentTime: undefined,
      timezone: 'UTC',
    });
    expect(mockCancelLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
    });
    expect(response).toContain('Done - I cancelled the appointment.');
  });

  it('reschedules with phone, DOB, and appointment date/time verification', async () => {
    const response = await handleAppointmentChangeTurn({
      tenantId: 'tenant-a',
      context,
      userMessage: 'yes',
      detectedMode: null,
      state: changeState({
        mode: 'reschedule',
        phoneNumber: '+15551234567',
        dateOfBirth: '1990-01-01',
        currentDate: '2026-06-01',
        currentTime: '14:00',
        preferredNewDate: '2026-06-02',
        preferredNewTime: '15:00',
      }),
    });

    expect(mockResolveVerifiedAppointmentForCaller).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      confirmationId: undefined,
      phoneNumber: '+15551234567',
      dateOfBirth: '1990-01-01',
      appointmentDate: '2026-06-01',
      appointmentTime: '14:00',
      timezone: 'UTC',
    });
    expect(mockRescheduleLedgerBackedAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      timezone: 'UTC',
      eventId: 'google-event-a',
      slot: {
        startIso: '2026-06-02T15:00:00.000Z',
        endIso: '2026-06-02T15:30:00.000Z',
      },
    });
    expect(response).toContain('Done - I moved the appointment to June 2 at 3:00 PM.');
  });

  it('returns safe generic not-found without appointment details', async () => {
    mockResolveVerifiedAppointmentForCaller.mockResolvedValueOnce({
      success: false,
      reason: 'not_found',
      message: APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE,
    });

    const response = await handleAppointmentChangeTurn({
      tenantId: 'tenant-a',
      context,
      userMessage: 'yes',
      detectedMode: null,
      state: changeState({
        mode: 'cancel',
        confirmationId: 'appointment-a',
      }),
    });

    expect(response).toContain(APPOINTMENT_VERIFICATION_NOT_FOUND_MESSAGE);
    expect(mockCancelLedgerBackedAppointment).not.toHaveBeenCalled();
  });
});
