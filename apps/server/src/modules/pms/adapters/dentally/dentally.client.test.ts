import { describe, expect, it, vi } from 'vitest';
import { DentallyClient, sanitizeDentallyMetadata } from './dentally.client.js';
import {
  DentallyApiError,
  DentallyAuthError,
  DentallyConflictError,
  DentallyNetworkError,
  DentallyRateLimitError,
  DentallyValidationError,
} from './dentally.errors.js';
import type { DentallyAuthContext } from './dentally.types.js';

type FetchImplementation = (input: string | URL, init?: RequestInit) => Promise<Response>;

function authContext(overrides: Partial<DentallyAuthContext['config']> = {}): DentallyAuthContext {
  return {
    baseUrl: 'https://api.sandbox.dentally.co',
    authorizationHeader: 'Bearer access-token-a',
    correlationId: 'correlation-a',
    integrationId: 'integration-a',
    tenantId: 'tenant-a',
    config: {
      baseUrl: 'https://api.sandbox.dentally.co',
      appointmentPath: '/appointments',
      patientPath: '/patients',
      clinicianPath: '/practitioners',
      roomPath: '/rooms',
      webhookPath: '/webhooks',
      authPath: '/user',
      signatureHeader: 'x-dentally-signature',
      timestampHeader: 'x-dentally-timestamp',
      replayWindowSeconds: 300,
      timeoutMs: 15000,
      maxRetries: 2,
      practiceId: 'practice-a',
      practiceName: 'Practice A',
      ...overrides,
    },
    credentials: {
      encryptedAccessToken: 'encrypted-access-token',
      encryptedRefreshToken: 'encrypted-refresh-token',
      accessTokenExpiresAt: '2026-06-01T10:00:00.000Z',
      scopes: [
        'appointment:read',
        'appointment:create',
        'appointment:update',
        'patient:read',
        'patient:create',
        'patient:update',
        'practice:read',
        'user:read',
      ],
      practiceId: 'practice-a',
      practiceName: 'Practice A',
    },
  };
}

describe('DentallyClient', () => {
  it('uses the official base URL with /v1 request paths and a valid user agent', async () => {
    const fetchImpl = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(new Response(JSON.stringify({ appointments: [] }), { status: 200 }));
    const client = new DentallyClient(authContext(), {
      fetchImpl,
      requestIdGenerator: () => 'request-a',
    });

    await client.listAppointments({
      on: '2026-06-01',
      before: '2026-06-02T00:00:00.000Z',
      after: '2026-06-01T00:00:00.000Z',
      practitioner_id: 'practitioner-a',
      patient_id: 'patient-a',
      room_id: 'room-a',
      site_id: 'site-a',
      state: 'Booked',
      cancelled: false,
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toContain('https://api.sandbox.dentally.co/v1/appointments?');
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get('on')).toBe('2026-06-01');
    expect(parsed.searchParams.get('before')).toBe('2026-06-02T00:00:00.000Z');
    expect(parsed.searchParams.get('after')).toBe('2026-06-01T00:00:00.000Z');
    expect(parsed.searchParams.get('practitioner_id')).toBe('practitioner-a');
    expect(parsed.searchParams.get('patient_id')).toBe('patient-a');
    expect(parsed.searchParams.get('room_id')).toBe('room-a');
    expect(parsed.searchParams.get('site_id')).toBe('site-a');
    expect(parsed.searchParams.get('state')).toBe('Booked');
    expect(parsed.searchParams.get('cancelled')).toBe('false');
    expect(init?.headers).toMatchObject({
      'User-Agent': 'DentalFlow-Dentally-Integration/1.0',
    });
  });

  it('looks up patients with the documented patients query endpoint', async () => {
    const fetchImpl = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(new Response(JSON.stringify({ patients: [] }), { status: 200 }));
    const client = new DentallyClient(authContext(), { fetchImpl });

    await client.listPatientsByPhone('+15551234567');

    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(`${url.origin}${url.pathname}`).toBe('https://api.sandbox.dentally.co/v1/patients');
    expect(url.searchParams.get('query')).toBe('+15551234567');
  });

  it('sanitizes patient metadata before wrapping patient payloads', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(
      new Response(JSON.stringify({ patient: { id: 'patient-a' } }), {
        status: 201,
      }),
    );
    const client = new DentallyClient(authContext(), { fetchImpl });

    await client.createPatient({
      first_name: 'Jane',
      metadata: {
        ['a'.repeat(60)]: 'x'.repeat(600),
        second: 2,
        third: false,
        fourth: 'ignored',
      },
    });

    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      patient: {
        first_name: 'Jane',
        metadata: {
          ['a'.repeat(40)]: 'x'.repeat(500),
          second: '2',
          third: 'false',
        },
      },
    });
  });

  it('wraps appointment create and update payloads in appointment', async () => {
    const fetchImpl = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ appointment: { id: 'appointment-a' } }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ appointment: { id: 'appointment-a' } }), { status: 200 }),
      );
    const client = new DentallyClient(authContext(), { fetchImpl });

    await client.createAppointment({
      patient_id: 'patient-a',
      start_time: '2026-06-01T09:00:00.000Z',
      finish_time: '2026-06-01T09:30:00.000Z',
    });
    await client.updateAppointment('appointment-a', {
      start_time: '2026-06-02T10:00:00.000Z',
      finish_time: '2026-06-02T10:30:00.000Z',
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.sandbox.dentally.co/v1/appointments');
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      appointment: {
        patient_id: 'patient-a',
        start_time: '2026-06-01T09:00:00.000Z',
        finish_time: '2026-06-01T09:30:00.000Z',
      },
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'https://api.sandbox.dentally.co/v1/appointments/appointment-a',
    );
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({
      appointment: {
        start_time: '2026-06-02T10:00:00.000Z',
        finish_time: '2026-06-02T10:30:00.000Z',
      },
    });
  });

  it('cancels by updating appointment state instead of deleting', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(
      new Response(JSON.stringify({ appointment: { id: 'appointment-a', state: 'Cancelled' } }), {
        status: 200,
      }),
    );
    const client = new DentallyClient(authContext(), { fetchImpl });

    await client.cancelAppointment('appointment-a');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      appointment: { state: 'Cancelled' },
    });
  });

  it('queries documented availability, appointment reasons, practitioners, and rooms endpoints', async () => {
    const fetchImpl = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            availability: [
              { start_time: '2026-06-01T09:00:00Z', finish_time: '2026-06-01T09:30:00Z' },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ appointment_reasons: [{ id: 1, name: 'Exam' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ practitioners: [{ id: 2, name: 'Dr Patel' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rooms: [{ id: 3, name: 'Room 1' }] }), {
          status: 200,
        }),
      );
    const client = new DentallyClient(authContext(), { fetchImpl });

    await client.getAvailability({
      start_time: '2026-06-01T00:00:00.000Z',
      finish_time: '2026-06-02T00:00:00.000Z',
      practitioner_ids: ['practitioner-a', 'practitioner-b'],
      duration: 30,
    });
    await client.listAppointmentReasons();
    await client.listPractitioners();
    await client.listRooms();

    const availabilityUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(`${availabilityUrl.origin}${availabilityUrl.pathname}`).toBe(
      'https://api.sandbox.dentally.co/v1/appointments/availability',
    );
    expect(availabilityUrl.searchParams.get('start_time')).toBe('2026-06-01T00:00:00.000Z');
    expect(availabilityUrl.searchParams.get('finish_time')).toBe('2026-06-02T00:00:00.000Z');
    expect(availabilityUrl.searchParams.getAll('practitioner_ids[]')).toEqual([
      'practitioner-a',
      'practitioner-b',
    ]);
    expect(availabilityUrl.searchParams.get('duration')).toBe('30');
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'https://api.sandbox.dentally.co/v1/appointment_reasons?deleted=false',
    );
    expect(fetchImpl.mock.calls[2]?.[0]).toBe('https://api.sandbox.dentally.co/v1/practitioners');
    expect(fetchImpl.mock.calls[3]?.[0]).toBe('https://api.sandbox.dentally.co/v1/rooms');
  });

  it('sanitizes Dentally metadata to at most 3 short string entries', () => {
    expect(
      sanitizeDentallyMetadata({
        ['a'.repeat(60)]: 'x'.repeat(600),
        second: 123,
        third: true,
        fourth: 'ignored',
      }),
    ).toEqual({
      ['a'.repeat(40)]: 'x'.repeat(500),
      second: '123',
      third: 'true',
    });
  });

  it('retries safe GET requests with request and correlation ids', async () => {
    const fetchImpl = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new DentallyClient(authContext(), {
      fetchImpl,
      sleep,
      requestIdGenerator: () => 'request-a',
    });

    await expect(client.healthCheck()).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.sandbox.dentally.co/v1/user');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer access-token-a',
      'X-Request-Id': 'request-a',
      'X-Correlation-Id': 'correlation-a',
      'User-Agent': 'DentalFlow-Dentally-Integration/1.0',
    });
  });

  it('maps request timeouts to DentallyNetworkError', async () => {
    const fetchImpl: FetchImplementation = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal instanceof AbortSignal) {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }
      });
    const client = new DentallyClient(authContext({ timeoutMs: 1, maxRetries: 0 }), {
      fetchImpl,
    });

    await expect(client.healthCheck()).rejects.toThrow(DentallyNetworkError);
  });

  it.each([
    [401, DentallyAuthError],
    [403, DentallyAuthError],
    [409, DentallyConflictError],
    [422, DentallyValidationError],
    [429, DentallyRateLimitError],
    [500, DentallyApiError],
    [502, DentallyApiError],
    [503, DentallyApiError],
    [504, DentallyApiError],
  ])('maps HTTP %s to a typed Dentally error', async (status, expectedError) => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'vendor failure' } }), {
        status,
        headers: status === 429 ? { 'retry-after': '3' } : undefined,
      }),
    );
    const client = new DentallyClient(authContext({ maxRetries: 0 }), { fetchImpl });

    await expect(client.healthCheck()).rejects.toThrow(expectedError);
  });

  it('fails credential validation when live OAuth scopes are missing', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 1 } }), {
        status: 200,
        headers: {
          'x-oauth-scopes': 'appointment:read patient:read practice:read user:read',
        },
      }),
    );
    const client = new DentallyClient(authContext(), { fetchImpl });

    await expect(client.validateCredentials()).rejects.toThrow(DentallyAuthError);
  });
});
