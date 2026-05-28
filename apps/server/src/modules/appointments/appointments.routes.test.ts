import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mockListUpcomingAppointments = vi.hoisted(() => vi.fn());
const mockCheckPublicAppointmentAvailability = vi.hoisted(() => vi.fn());
const mockBookPublicAppointment = vi.hoisted(() => vi.fn());
const mockCancelAppointmentFromRoute = vi.hoisted(() => vi.fn());
const mockRescheduleAppointmentFromRoute = vi.hoisted(() => vi.fn());
const mockDirectGoogleBypass = vi.hoisted(() => vi.fn());

vi.mock('./appointment-application.service.js', () => ({
  listUpcomingAppointments: mockListUpcomingAppointments,
  checkPublicAppointmentAvailability: mockCheckPublicAppointmentAvailability,
  bookPublicAppointment: mockBookPublicAppointment,
  cancelAppointmentFromRoute: mockCancelAppointmentFromRoute,
  rescheduleAppointmentFromRoute: mockRescheduleAppointmentFromRoute,
}));

vi.mock('../integrations/integration.service.js', () => ({
  findAvailableCalendarSlots: mockDirectGoogleBypass,
  createGoogleCalendarAppointment: mockDirectGoogleBypass,
  getActiveGoogleCalendarIntegration: mockDirectGoogleBypass,
  cancelGoogleCalendarAppointment: mockDirectGoogleBypass,
  rescheduleGoogleCalendarAppointment: mockDirectGoogleBypass,
}));

vi.mock('../../middleware/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../middleware/validate.js')>(
    '../../middleware/validate.js',
  );
  return {
    validate: actual.validate,
    authenticateJwt: (req: Request, _res: Response, next: NextFunction) => {
      req.user = { userId: 'user-a', role: 'admin', tenantId: 'tenant-a' };
      next();
    },
    resolveTenant: (req: Request, _res: Response, next: NextFunction) => {
      req.tenantContext = {
        tenantId: 'tenant-a',
        clinicSlug: 'clinic-a',
        status: 'active',
        activeConfigVersion: 1,
        resolvedVia: 'jwt',
        correlationId: 'correlation-a',
        requestedAt: '2026-05-26T12:00:00.000Z',
      };
      next();
    },
    rateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

import { appointmentsRouter } from './appointments.routes.js';

interface RouterResponse {
  statusCode: number;
  body: unknown;
}

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status(this: FakeResponse, code: number): FakeResponse;
  json(this: FakeResponse, body: unknown): FakeResponse;
}

async function request(input: {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): Promise<RouterResponse> {
  return await new Promise((resolve) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input.query ?? {})) {
      query.set(key, String(value));
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const req = {
      method: input.method,
      url: `${input.path}${suffix}`,
      originalUrl: `${input.path}${suffix}`,
      path: input.path,
      headers: {},
      ip: '127.0.0.1',
      body: input.body ?? {},
      query: input.query ?? {},
      params: {},
      audit: vi.fn(),
    } as unknown as Request;

    const res: FakeResponse = {
      statusCode: 200,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        resolve({ statusCode: this.statusCode, body });
        return this;
      },
    };

    (
      appointmentsRouter as unknown as {
        handle: (req: Request, res: Response, next: NextFunction) => void;
      }
    ).handle(
      req,
      res as unknown as Response,
      ((err?: unknown) => {
        if (err) {
          resolve({ statusCode: 500, body: err });
          return;
        }
        resolve({ statusCode: res.statusCode, body: undefined });
      }) as NextFunction,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListUpcomingAppointments.mockResolvedValue({
    calendarId: 'primary',
    events: [
      { id: 'google-event-a', summary: 'Appointment', start: 's', end: 'e', status: 'confirmed' },
    ],
  });
  mockCheckPublicAppointmentAvailability.mockResolvedValue({
    exactMatch: null,
    suggestedSlots: [
      {
        startIso: '2026-06-01T14:00:00.000Z',
        endIso: '2026-06-01T14:30:00.000Z',
        label: 'June 1 at 2:00 PM',
      },
    ],
    timezone: 'UTC',
  });
  mockBookPublicAppointment.mockResolvedValue({
    eventId: 'google-event-a',
    htmlLink: 'https://calendar.example/event-a',
    slot: {
      startIso: '2026-06-01T14:00:00.000Z',
      endIso: '2026-06-01T14:30:00.000Z',
      label: 'June 1 at 2:00 PM',
    },
    appointmentId: 'appointment-a',
  });
  mockCancelAppointmentFromRoute.mockResolvedValue({
    success: true,
    appointmentId: 'appointment-a',
  });
  mockRescheduleAppointmentFromRoute.mockResolvedValue({
    success: true,
    appointmentId: 'appointment-a',
    slot: { startIso: '2026-06-02T14:00:00.000Z', endIso: '2026-06-02T14:30:00.000Z' },
  });
});

describe('appointment routes', () => {
  it('lists upcoming appointments through the application service', async () => {
    const response = await request({
      method: 'GET',
      path: '/upcoming',
      query: { days: '7' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockListUpcomingAppointments).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      days: 7,
    });
    expect(mockDirectGoogleBypass).not.toHaveBeenCalled();
  });

  it('checks availability through the application service', async () => {
    const response = await request({
      method: 'POST',
      path: '/availability',
      body: {
        requestedDate: '2026-06-01',
        requestedTime: '14:00',
        appointmentDurationMinutes: 30,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockCheckPublicAppointmentAvailability).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      requestedDate: '2026-06-01',
      requestedTime: '14:00',
      requestedPeriod: null,
      appointmentDurationMinutes: 30,
      maxSlots: 5,
      lookAheadDays: 14,
    });
    expect(mockDirectGoogleBypass).not.toHaveBeenCalled();
  });

  it('books through the application service', async () => {
    const body = {
      idempotencyKey: 'book-key-a',
      slot: {
        startIso: '2026-06-01T14:00:00.000Z',
        endIso: '2026-06-01T14:30:00.000Z',
      },
      patient: {
        fullName: 'Jane Secret',
        phoneNumber: '+15551234567',
        reasonForVisit: 'Cleaning',
      },
    };

    const response = await request({ method: 'POST', path: '/book', body });

    expect(response.statusCode).toBe(200);
    expect(mockBookPublicAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      slot: body.slot,
      patient: body.patient,
      idempotencyKey: 'book-key-a',
    });
    expect(response.body).toMatchObject({
      data: {
        eventId: 'google-event-a',
        htmlLink: 'https://calendar.example/event-a',
      },
    });
    expect(mockDirectGoogleBypass).not.toHaveBeenCalled();
  });

  it('cancels through the application service', async () => {
    const response = await request({
      method: 'POST',
      path: '/cancel',
      body: { eventId: 'google-event-a' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockCancelAppointmentFromRoute).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
    });
    expect(mockDirectGoogleBypass).not.toHaveBeenCalled();
  });

  it('reschedules through the application service', async () => {
    const body = {
      eventId: 'google-event-a',
      slot: {
        startIso: '2026-06-02T14:00:00.000Z',
        endIso: '2026-06-02T14:30:00.000Z',
      },
    };

    const response = await request({ method: 'POST', path: '/reschedule', body });

    expect(response.statusCode).toBe(200);
    expect(mockRescheduleAppointmentFromRoute).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
      slot: body.slot,
    });
    expect(mockDirectGoogleBypass).not.toHaveBeenCalled();
  });
});
