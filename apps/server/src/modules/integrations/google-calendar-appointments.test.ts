import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment,
} from './google-calendar-appointments.js';
import type { Integration } from './integration.types.js';

const mockGetActiveGoogleCalendarIntegration = vi.hoisted(() => vi.fn());
const mockResolveValidGoogleAccessToken = vi.hoisted(() => vi.fn());

vi.mock('./integration-registry.js', () => ({
  getActiveGoogleCalendarIntegration: mockGetActiveGoogleCalendarIntegration,
}));

vi.mock('./google-calendar.shared.js', async () => {
  const actual = await vi.importActual<typeof import('./google-calendar.shared.js')>(
    './google-calendar.shared.js',
  );
  return {
    ...actual,
    resolveValidGoogleAccessToken: mockResolveValidGoogleAccessToken,
  };
});

const integration = {
  id: 'integration-a',
  tenantId: 'tenant-a',
  config: { calendarId: 'primary' },
} as Integration;

const slot = {
  startIso: '2026-06-01T14:00:00.000Z',
  endIso: '2026-06-01T14:30:00.000Z',
};

const patient = {
  fullName: 'Jane Secret',
  age: 34,
  phoneNumber: '+15551234567',
  reasonForVisit: 'Severe tooth pain and needs sedation',
  dateOfBirth: '1990-01-01',
};

function mockGoogleResponse(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 'google-event-a',
        htmlLink: 'https://calendar.example/event-a',
      }),
    }),
  );
}

function requestBody(): Record<string, unknown> {
  const fetchMock = vi.mocked(fetch);
  const init = fetchMock.mock.calls[0]?.[1];
  expect(init).toBeDefined();
  expect(typeof init?.body).toBe('string');
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

function expectNoPhi(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('Jane Secret');
  expect(serialized).not.toContain('+15551234567');
  expect(serialized).not.toContain('1990-01-01');
  expect(serialized).not.toContain('34');
  expect(serialized).not.toContain('Severe tooth pain');
  expect(serialized).not.toContain('needs sedation');
  expect(serialized).not.toContain('patientName');
  expect(serialized).not.toContain('dateOfBirth');
  expect(serialized).not.toContain('phoneNumber');
  expect(serialized).not.toContain('reasonForVisit');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockGetActiveGoogleCalendarIntegration.mockResolvedValue(integration);
  mockResolveValidGoogleAccessToken.mockResolvedValue({ accessToken: 'google-token', integration });
  mockGoogleResponse();
});

describe('Google Calendar appointment PHI minimization', () => {
  it('creates Google events with only safe operational metadata', async () => {
    await createGoogleCalendarAppointment({
      tenantId: 'tenant-a',
      timezone: 'UTC',
      appAppointmentId: 'appointment-a',
      slot,
      summary: 'Dental appointment - Jane Secret',
      patient,
    });

    const body = requestBody();
    expect(body).toMatchObject({
      summary: 'Dental Appointment',
      description:
        'Appointment managed by DentalFlow. View patient details inside the DentalFlow dashboard.',
      start: { dateTime: slot.startIso, timeZone: 'UTC' },
      end: { dateTime: slot.endIso, timeZone: 'UTC' },
      extendedProperties: {
        private: {
          tenantId: 'tenant-a',
          appAppointmentId: 'appointment-a',
          source: 'dentalflow',
        },
      },
    });
    expect((body.extendedProperties as { shared?: unknown }).shared).toBeUndefined();
    expectNoPhi(body);
  });

  it('reschedules Google events without reintroducing PHI fields', async () => {
    await rescheduleGoogleCalendarAppointment({
      tenantId: 'tenant-a',
      timezone: 'UTC',
      eventId: 'google-event-a',
      appAppointmentId: 'appointment-a',
      slot,
    });

    const body = requestBody();
    expect(body).toMatchObject({
      summary: 'Dental Appointment',
      description:
        'Appointment managed by DentalFlow. View patient details inside the DentalFlow dashboard.',
      start: { dateTime: slot.startIso, timeZone: 'UTC' },
      end: { dateTime: slot.endIso, timeZone: 'UTC' },
      extendedProperties: {
        private: {
          tenantId: 'tenant-a',
          appAppointmentId: 'appointment-a',
          source: 'dentalflow',
        },
      },
    });
    expect((body.extendedProperties as { shared?: unknown }).shared).toBeUndefined();
    expectNoPhi(body);
  });
});
