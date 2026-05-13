import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { db } from '../../db/index.js';
import { runWithTenantContext } from '../../db/tenant-context.js';
import { AuthorizationError } from '../../lib/errors.js';
import type { Appointment } from './appointment-ledger.service.js';

const mockGetAppointment = vi.hoisted(() => vi.fn());
const mockAttachExternalCalendarEvent = vi.hoisted(() => vi.fn());
const mockCancelGoogleCalendarAppointment = vi.hoisted(() => vi.fn());
const mockRescheduleGoogleCalendarAppointment = vi.hoisted(() => vi.fn());

vi.mock('./appointment-ledger.service.js', async () => {
  const actual = await vi.importActual<typeof import('./appointment-ledger.service.js')>(
    './appointment-ledger.service.js',
  );
  return {
    ...actual,
    getAppointment: mockGetAppointment,
    attachExternalCalendarEvent: mockAttachExternalCalendarEvent,
  };
});

vi.mock('../integrations/google-calendar-appointments.js', () => ({
  cancelGoogleCalendarAppointment: mockCancelGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment: mockRescheduleGoogleCalendarAppointment,
}));

import {
  processAppointmentReconciliationCandidate,
  processDueAppointmentReconciliations,
} from './appointment-reconciliation.service.js';

interface UpdateChain<T> {
  set: Mock;
  where: Mock;
  returning: Mock;
}

interface SelectChain<T> {
  from: Mock;
  where: Mock;
  limit: Mock;
}

interface MockDb {
  select: Mock;
  update: Mock;
  transaction: Mock;
}

const mockDb = db as unknown as MockDb;

function updateChain<T>(): UpdateChain<T> {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue([]),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function selectChain<T>(result: T[]): SelectChain<T> {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appointment-a',
    tenantId: 'tenant-a',
    patientId: 'patient-a',
    serviceId: 'service-a',
    staffId: 'staff-a',
    callSessionId: 'call-a',
    status: 'scheduled',
    startAt: new Date('2026-06-01T14:00:00.000Z'),
    endAt: new Date('2026-06-01T14:30:00.000Z'),
    timezone: 'America/New_York',
    calendarIntegrationId: 'integration-a',
    externalCalendarEventId: null,
    idempotencyKey: 'tenant-a:call-a:slot-1',
    metadata: {
      reconciliation: {
        status: 'external_created_local_confirm_failed',
        externalCalendarEventId: 'google-event-a',
        retryCount: 0,
      },
    },
    createdAt: new Date('2026-05-13T00:00:00.000Z'),
    updatedAt: new Date('2026-05-13T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (callback: (tx: MockDb) => Promise<unknown>) =>
    callback(mockDb),
  );
  mockDb.update.mockImplementation(() => updateChain<Appointment>());
  mockAttachExternalCalendarEvent.mockResolvedValue(undefined);
  mockCancelGoogleCalendarAppointment.mockResolvedValue(undefined);
  mockRescheduleGoogleCalendarAppointment.mockResolvedValue(undefined);
  mockGetAppointment.mockImplementation(async (_tenantId: string, appointmentId: string) =>
    appointment({ id: appointmentId }),
  );
});

describe('appointment reconciliation processor', () => {
  it('attaches external event ID and resolves external_created_local_confirm_failed', async () => {
    const candidate = appointment();

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({ tenantId: 'tenant-a', appointment: candidate }),
    );

    expect(result).toEqual({ appointmentId: 'appointment-a', status: 'resolved' });
    expect(mockAttachExternalCalendarEvent).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appointmentId: 'appointment-a',
      externalCalendarEventId: 'google-event-a',
    });
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it('resolves external_created_local_confirm_failed when already confirmed', async () => {
    const candidate = appointment({
      status: 'confirmed',
      externalCalendarEventId: 'google-event-a',
    });

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({ tenantId: 'tenant-a', appointment: candidate }),
    );

    expect(result.status).toBe('resolved');
    expect(mockAttachExternalCalendarEvent).not.toHaveBeenCalled();
  });

  it('fails external_created_local_confirm_failed when event ID is missing', async () => {
    const candidate = appointment({
      metadata: { reconciliation: { status: 'external_created_local_confirm_failed' } },
    });

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({ tenantId: 'tenant-a', appointment: candidate }),
    );

    expect(result).toMatchObject({
      appointmentId: 'appointment-a',
      status: 'failed',
      reason: 'Missing external calendar event id for confirmation repair',
    });
  });

  it('calls Google delete for local_cancelled_external_cancel_failed', async () => {
    const candidate = appointment({
      status: 'cancelled',
      externalCalendarEventId: 'google-event-a',
      metadata: { reconciliation: { status: 'local_cancelled_external_cancel_failed' } },
    });

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({ tenantId: 'tenant-a', appointment: candidate }),
    );

    expect(result.status).toBe('resolved');
    expect(mockCancelGoogleCalendarAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
    });
  });

  it('resolves local_cancelled_external_cancel_failed when no external event exists', async () => {
    const candidate = appointment({
      status: 'cancelled',
      metadata: { reconciliation: { status: 'local_cancelled_external_cancel_failed' } },
    });

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({ tenantId: 'tenant-a', appointment: candidate }),
    );

    expect(result.status).toBe('resolved');
    expect(mockCancelGoogleCalendarAppointment).not.toHaveBeenCalled();
  });

  it('schedules retry on retryable Google cancellation failure', async () => {
    mockCancelGoogleCalendarAppointment.mockRejectedValueOnce(new Error('google down'));
    mockGetAppointment.mockResolvedValue(
      appointment({
        status: 'cancelled',
        externalCalendarEventId: 'google-event-a',
        metadata: {
          reconciliation: {
            status: 'local_cancelled_external_cancel_failed',
            retryCount: 1,
          },
        },
      }),
    );
    const candidate = appointment({
      status: 'cancelled',
      externalCalendarEventId: 'google-event-a',
      metadata: {
        reconciliation: {
          status: 'local_cancelled_external_cancel_failed',
          retryCount: 0,
        },
      },
    });

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({
        tenantId: 'tenant-a',
        appointment: candidate,
        now: new Date('2026-05-13T12:00:00.000Z'),
        baseRetryDelayMs: 1000,
      }),
    );

    expect(result).toMatchObject({
      appointmentId: 'appointment-a',
      status: 'retry_scheduled',
      reason: 'google down',
    });
  });

  it('calls Google reschedule with local appointment times', async () => {
    const candidate = appointment({
      externalCalendarEventId: 'google-event-a',
      metadata: { reconciliation: { status: 'local_rescheduled_external_reschedule_failed' } },
    });

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({ tenantId: 'tenant-a', appointment: candidate }),
    );

    expect(result.status).toBe('resolved');
    expect(mockRescheduleGoogleCalendarAppointment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      eventId: 'google-event-a',
      appAppointmentId: 'appointment-a',
      timezone: 'America/New_York',
      slot: {
        startIso: '2026-06-01T14:00:00.000Z',
        endIso: '2026-06-01T14:30:00.000Z',
      },
    });
  });

  it('schedules retry on retryable Google reschedule failure', async () => {
    mockRescheduleGoogleCalendarAppointment.mockRejectedValueOnce(new Error('patch failed'));
    const candidate = appointment({
      externalCalendarEventId: 'google-event-a',
      metadata: {
        reconciliation: {
          status: 'local_rescheduled_external_reschedule_failed',
          retryCount: 0,
        },
      },
    });

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({ tenantId: 'tenant-a', appointment: candidate }),
    );

    expect(result).toMatchObject({ status: 'retry_scheduled', reason: 'patch failed' });
  });

  it('fails local_rescheduled_external_reschedule_failed when event ID is missing', async () => {
    const candidate = appointment({
      metadata: { reconciliation: { status: 'local_rescheduled_external_reschedule_failed' } },
    });

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({ tenantId: 'tenant-a', appointment: candidate }),
    );

    expect(result).toMatchObject({
      status: 'failed',
      reason: 'Missing external calendar event id for reschedule repair',
    });
  });

  it('marks failed when max retries are exceeded', async () => {
    const candidate = appointment({
      metadata: {
        reconciliation: {
          status: 'local_cancelled_external_cancel_failed',
          retryCount: 5,
        },
      },
    });

    const result = await withTenant('tenant-a', () =>
      processAppointmentReconciliationCandidate({
        tenantId: 'tenant-a',
        appointment: candidate,
        maxRetries: 5,
      }),
    );

    expect(result).toMatchObject({
      status: 'failed',
      reason: 'Appointment reconciliation exceeded max retries (5)',
    });
    expect(mockCancelGoogleCalendarAppointment).not.toHaveBeenCalled();
  });

  it('does not let one failed candidate stop the next candidate', async () => {
    const first = appointment({
      id: 'appointment-failed',
      tenantId: 'tenant-a',
      metadata: { reconciliation: { status: 'local_rescheduled_external_reschedule_failed' } },
    });
    const second = appointment({
      id: 'appointment-resolved',
      tenantId: 'tenant-a',
      status: 'cancelled',
      metadata: { reconciliation: { status: 'local_cancelled_external_cancel_failed' } },
    });
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([first, second]));

    const results = await withTenant('tenant-a', () =>
      processDueAppointmentReconciliations({ tenantId: 'tenant-a' }),
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe('failed');
    expect(results[1]?.status).toBe('resolved');
  });

  it('rejects tenant mismatch candidates', async () => {
    await expect(
      withTenant('tenant-a', () =>
        processAppointmentReconciliationCandidate({
          tenantId: 'tenant-a',
          appointment: appointment({ tenantId: 'tenant-b' }),
        }),
      ),
    ).rejects.toThrow('Appointment reconciliation candidate tenant mismatch');
  });

  it('rejects processing without active tenant context', async () => {
    await expect(
      processAppointmentReconciliationCandidate({
        tenantId: 'tenant-a',
        appointment: appointment(),
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});
