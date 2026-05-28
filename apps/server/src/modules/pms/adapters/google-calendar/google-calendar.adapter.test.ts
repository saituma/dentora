import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAvailableCalendarSlots = vi.hoisted(() => vi.fn());
const mockCreateGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockFindGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockListUpcomingGoogleCalendarAppointments = vi.hoisted(() => vi.fn());
const mockCancelGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockRescheduleGoogleCalendarAppointment = vi.hoisted(() => vi.fn());

vi.mock('../../../integrations/google-calendar-availability.js', () => ({
  findAvailableCalendarSlots: mockFindAvailableCalendarSlots,
}));

vi.mock('../../../integrations/google-calendar-appointments.js', () => ({
  createGoogleCalendarAppointment: mockCreateGoogleCalendarAppointment,
  findGoogleCalendarAppointment: mockFindGoogleCalendarAppointment,
  listUpcomingGoogleCalendarAppointments: mockListUpcomingGoogleCalendarAppointments,
  cancelGoogleCalendarAppointment: mockCancelGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment: mockRescheduleGoogleCalendarAppointment,
}));

import { GoogleCalendarSchedulingProvider } from './google-calendar.adapter.js';

const slot = {
  startIso: '2026-06-01T14:00:00.000Z',
  endIso: '2026-06-01T14:30:00.000Z',
};
const { startIso, endIso } = slot;
const slotWithLabel = { ...slot, label: 'June 1 at 2:00 PM' };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindAvailableCalendarSlots.mockResolvedValue({
    exactMatch: slotWithLabel,
    suggestedSlots: [slotWithLabel],
  });
  mockCreateGoogleCalendarAppointment.mockResolvedValue({
    eventId: 'google-event-a',
    htmlLink: 'https://calendar.example/event-a',
    slot: slotWithLabel,
  });
  mockFindGoogleCalendarAppointment.mockResolvedValue({
    eventId: 'google-event-a',
    summary: 'Dental appointment',
    startIso,
    endIso,
    label: 'June 1 at 2:00 PM',
  });
  mockListUpcomingGoogleCalendarAppointments.mockResolvedValue({
    calendarId: 'primary',
    events: [
      {
        eventId: 'google-event-a',
        summary: 'Appointment',
        description: '',
        htmlLink: 'https://calendar.example/event-a',
        startIso,
        endIso,
        status: 'confirmed',
      },
    ],
  });
});

describe('GoogleCalendarSchedulingProvider', () => {
  it('delegates appointment listing through the Google adapter boundary', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });

    const result = await provider.listAppointments({ tenantId: 'tenant-a', days: 7 });

    expect(mockListUpcomingGoogleCalendarAppointments).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      days: 7,
    });
    expect(result).toEqual({
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
  });

  it('delegates appointment lookup through the Google adapter boundary', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });

    const result = await provider.findAppointment({
      tenantId: 'tenant-a',
      timezone: 'UTC',
      phoneNumber: '+15551234567',
    });

    expect(mockFindGoogleCalendarAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      timezone: 'UTC',
      phoneNumber: '+15551234567',
    });
    expect(result).toMatchObject({
      id: 'google-event-a',
      provider: 'google_calendar',
      summary: 'Dental appointment',
    });
  });

  it('delegates availability to the existing Google Calendar availability implementation', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });
    const params = {
      tenantId: 'tenant-a',
      timezone: 'UTC',
      requestedDate: '2026-06-01',
      requestedTime: '14:00',
      requestedPeriod: null,
      appointmentDurationMinutes: 30,
    };

    const result = await provider.getAvailability(params);

    expect(mockFindAvailableCalendarSlots).toHaveBeenCalledWith(params);
    expect(result).toEqual([slotWithLabel]);
  });

  it('delegates appointment creation and maps the Google event into a provider-neutral appointment', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });

    const result = await provider.createAppointment({
      tenantId: 'tenant-a',
      timezone: 'UTC',
      appAppointmentId: 'appointment-a',
      slot,
      summary: 'Dental appointment - Jane Secret',
      patient: {
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
      },
    });

    expect(mockCreateGoogleCalendarAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        appAppointmentId: 'appointment-a',
        slot,
      }),
    );
    expect(result).toEqual({
      id: 'google-event-a',
      tenantId: 'tenant-a',
      provider: 'google_calendar',
      slot: slotWithLabel,
      htmlLink: 'https://calendar.example/event-a',
      appAppointmentId: 'appointment-a',
    });
  });

  it('delegates cancellation using the tenant-bound provider context', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });

    await provider.cancelAppointment('google-event-a');

    expect(mockCancelGoogleCalendarAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
    });
  });

  it('delegates rescheduling using the provider-neutral reschedule params', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });

    const result = await provider.rescheduleAppointment('google-event-a', {
      tenantId: 'tenant-a',
      timezone: 'UTC',
      appAppointmentId: 'appointment-a',
      slot,
    });

    expect(mockRescheduleGoogleCalendarAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
      appAppointmentId: 'appointment-a',
      timezone: 'UTC',
      slot,
    });
    expect(result).toMatchObject({
      id: 'google-event-a',
      tenantId: 'tenant-a',
      provider: 'google_calendar',
      appAppointmentId: 'appointment-a',
    });
  });

  it('does not pretend Google Calendar is a patient source', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });

    await expect(provider.findPatient('+15551234567')).resolves.toBeNull();
  });

  it('reports Google patient upsert as an unavailable provider capability', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });

    await expect(
      provider.upsertPatient({
        tenantId: 'tenant-a',
        patient: {
          fullName: 'Jane Secret',
          phoneNumber: '+15551234567',
          reasonForVisit: 'Cleaning',
        },
      }),
    ).rejects.toMatchObject({
      name: 'SchedulingProviderCapabilityUnavailableError',
      provider: 'google_calendar',
      capability: 'patient upsert',
    });
  });

  it('validates credentials through a minimal Google calendar health check', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });

    await expect(provider.validateCredentials()).resolves.toBeUndefined();
    await expect(provider.healthCheck()).resolves.toMatchObject({
      provider: 'google_calendar',
      healthy: true,
    });
    expect(mockListUpcomingGoogleCalendarAppointments).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      days: 1,
      maxResults: 1,
    });
  });

  it('rejects cross-tenant provider calls before touching Google', async () => {
    const provider = new GoogleCalendarSchedulingProvider({ tenantId: 'tenant-a' });

    await expect(
      provider.getAvailability({
        tenantId: 'tenant-b',
        timezone: 'UTC',
        requestedDate: '2026-06-01',
        appointmentDurationMinutes: 30,
      }),
    ).rejects.toThrow('Scheduling provider tenant mismatch');

    expect(mockFindAvailableCalendarSlots).not.toHaveBeenCalled();
  });
});
