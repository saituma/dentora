import { PassThrough, Readable, Writable } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  dentallySandboxSimulatorApp,
  dentallySandboxSimulatorState,
  seedDentallySandboxSimulator,
} from './dentally-sandbox-simulator.js';

interface SimulatorResponse {
  status: number;
  headers: Record<string, string | number | string[]>;
  body: Record<string, unknown>;
}

function authHeaders(): Record<string, string> {
  return {
    authorization: 'Bearer simulator-token',
    'user-agent': 'DentallySimulatorTest/1.0',
    'content-type': 'application/json',
  };
}

async function request(input: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<SimulatorResponse> {
  const rawBody = input.body === undefined ? '' : JSON.stringify(input.body);
  const req = Readable.from(rawBody) as unknown as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
    socket: PassThrough & { remoteAddress: string };
  };
  req.method = input.method;
  req.url = input.path;
  req.headers = {
    ...(input.headers ?? {}),
    ...(rawBody ? { 'content-length': String(Buffer.byteLength(rawBody)) } : {}),
  };
  const socket = new PassThrough() as PassThrough & { remoteAddress: string };
  socket.remoteAddress = '127.0.0.1';
  req.socket = socket;

  let status = 200;
  const headers: Record<string, string | number | string[]> = {};
  let responseBody = '';
  const res = new Writable({
    write(chunk, _encoding, callback) {
      responseBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      callback();
    },
  }) as Writable & {
    statusCode: number;
    setHeader: (name: string, value: string | number | string[]) => void;
    getHeader: (name: string) => string | number | string[] | undefined;
    removeHeader: (name: string) => void;
    end: (chunk?: unknown) => Writable;
  };
  res.statusCode = 200;
  res.setHeader = (name, value) => {
    headers[name.toLowerCase()] = value;
  };
  res.getHeader = (name) => headers[name.toLowerCase()];
  res.removeHeader = (name) => {
    delete headers[name.toLowerCase()];
  };
  const originalEnd = res.end.bind(res);
  res.end = (chunk?: unknown) => {
    if (chunk !== undefined) {
      responseBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
    status = res.statusCode;
    return originalEnd();
  };

  await new Promise<void>((resolve, reject) => {
    res.on('finish', resolve);
    res.on('error', reject);
    dentallySandboxSimulatorApp(req as never, res as never);
  });

  return {
    status,
    headers,
    body: responseBody ? (JSON.parse(responseBody) as Record<string, unknown>) : {},
  };
}

beforeEach(() => {
  dentallySandboxSimulatorState.patients.length = 0;
  dentallySandboxSimulatorState.appointments.length = 0;
  dentallySandboxSimulatorState.webhookDeliveries.length = 0;
  dentallySandboxSimulatorState.requestCounts.clear();
  seedDentallySandboxSimulator();
});

describe('Dentally sandbox simulator', () => {
  it('emulates documented read endpoints and OAuth scope headers', async () => {
    const user = await request({ method: 'GET', path: '/v1/user', headers: authHeaders() });
    expect(user.status).toBe(200);
    expect(user.headers['x-oauth-scopes']).toContain('appointment:read');

    const reasons = await request({
      method: 'GET',
      path: '/v1/appointment_reasons?deleted=false',
      headers: authHeaders(),
    });
    const practitioners = await request({
      method: 'GET',
      path: '/v1/practitioners',
      headers: authHeaders(),
    });
    const rooms = await request({ method: 'GET', path: '/v1/rooms', headers: authHeaders() });

    expect(reasons.body.appointment_reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ deleted: false })]),
    );
    expect(practitioners.body.practitioners).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'practitioner-1' })]),
    );
    expect(rooms.body.rooms).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'room-1' })]),
    );
  });

  it('requires valid auth and user-agent headers', async () => {
    const response = await request({ method: 'GET', path: '/v1/appointments' });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: { message: 'Authorization bearer token is required' },
    });
  });

  it('supports patient lookup and rejects invalid metadata limits', async () => {
    const lookup = await request({
      method: 'GET',
      path: '/v1/patients?query=%2B15551234567',
      headers: authHeaders(),
    });
    expect(lookup.body).toMatchObject({
      patients: [expect.objectContaining({ id: 'patient-1' })],
    });

    const invalid = await request({
      method: 'POST',
      path: '/v1/patients',
      headers: authHeaders(),
      body: {
        patient: {
          first_name: 'Too',
          last_name: 'Many',
          metadata: { a: '1', b: '2', c: '3', d: '4' },
        },
      },
    });

    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({
      error: { message: 'Metadata supports at most 3 keys' },
    });
  });

  it('creates, reschedules, cancels, and records webhooks without DELETE', async () => {
    const create = await request({
      method: 'POST',
      path: '/v1/appointments',
      headers: authHeaders(),
      body: {
        appointment: {
          patient_id: 'patient-1',
          practitioner_id: 'practitioner-1',
          room_id: 'room-1',
          start_time: '2026-06-01T10:00:00.000Z',
          finish_time: '2026-06-01T10:30:00.000Z',
          reason: 'Dental examination',
        },
      },
    });
    expect(create.status).toBe(201);
    const created = create.body.appointment as Record<string, unknown>;
    expect(created).toMatchObject({
      patient_id: 'patient-1',
      state: 'Booked',
    });

    const appointmentId = String(created.id);
    expect(
      await request({
        method: 'PATCH',
        path: `/v1/appointments/${appointmentId}`,
        headers: authHeaders(),
        body: {
          appointment: {
            start_time: '2026-06-02T11:00:00.000Z',
            finish_time: '2026-06-02T11:30:00.000Z',
          },
        },
      }),
    ).toMatchObject({ status: 200 });

    const cancel = await request({
      method: 'PATCH',
      path: `/v1/appointments/${appointmentId}`,
      headers: authHeaders(),
      body: { appointment: { state: 'Cancelled' } },
    });
    expect(cancel.body).toMatchObject({
      appointment: { state: 'Cancelled', cancelled: true },
    });

    const deleteAttempt = await request({
      method: 'DELETE',
      path: `/v1/appointments/${appointmentId}`,
      headers: authHeaders(),
    });
    expect(deleteAttempt.status).toBe(405);
    expect(dentallySandboxSimulatorState.webhookDeliveries.map((item) => item.eventType)).toEqual([
      'appointment.created',
      'appointment.updated',
      'appointment.cancelled',
    ]);
  });

  it('returns availability with required documented query params', async () => {
    const response = await request({
      method: 'GET',
      path: '/v1/appointments/availability?start_time=2026-06-01T09%3A00%3A00.000Z&finish_time=2026-06-01T10%3A00%3A00.000Z&practitioner_ids[]=practitioner-1&duration=30',
      headers: authHeaders(),
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      availability: [
        expect.objectContaining({
          start_time: '2026-06-01T09:30:00.000Z',
          finish_time: '2026-06-01T10:00:00.000Z',
          practitioner_id: 'practitioner-1',
        }),
      ],
    });
  });
});
