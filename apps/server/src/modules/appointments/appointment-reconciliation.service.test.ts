import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { db } from '../../db/index.js';
import { runWithTenantContext } from '../../db/tenant-context.js';
import { AuthorizationError } from '../../lib/errors.js';
import type { Appointment } from './appointment-ledger.service.js';
import {
  findAppointmentsNeedingReconciliation,
  markAppointmentReconciliationFailed,
  markAppointmentReconciliationPending,
  markAppointmentReconciliationResolved,
  markAppointmentReconciliationRetrying,
} from './appointment-reconciliation.service.js';

interface SelectChain<T> {
  from: Mock;
  where: Mock;
  limit: Mock;
  result: T[];
}

interface UpdateChain<T> {
  set: Mock;
  where: Mock;
  returning: Mock;
  result: T[];
}

interface MockDb {
  select: Mock;
  update: Mock;
  transaction: Mock;
}

const mockDb = db as unknown as MockDb;

const baseAppointment: Appointment = {
  id: 'appointment-a',
  tenantId: 'tenant-a',
  patientId: 'patient-a',
  serviceId: 'service-a',
  staffId: 'staff-a',
  callSessionId: 'call-a',
  status: 'cancelled',
  startAt: new Date('2026-06-01T14:00:00.000Z'),
  endAt: new Date('2026-06-01T14:30:00.000Z'),
  timezone: 'America/New_York',
  calendarIntegrationId: 'integration-a',
  externalCalendarEventId: 'google-event-a',
  idempotencyKey: 'tenant-a:call-a:slot-1',
  metadata: {
    source: 'appointments.cancel',
    reconciliation: {
      status: 'local_cancelled_external_cancel_failed',
      workflowState: 'pending',
      operation: 'cancel',
      retryCount: 1,
      lastAttemptAt: '2026-05-13T12:00:00.000Z',
      lastError: 'Google Calendar delete failed',
      nextRetryAt: '2026-05-13T12:05:00.000Z',
    },
  },
  createdAt: new Date('2026-05-13T00:00:00.000Z'),
  updatedAt: new Date('2026-05-13T00:00:00.000Z'),
};

function selectChain<T>(result: T[]): SelectChain<T> {
  const chain: SelectChain<T> = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    result,
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function updateChain<T>(result: T[]): UpdateChain<T> {
  const chain: UpdateChain<T> = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
    result,
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (callback: (tx: MockDb) => Promise<unknown>) =>
    callback(mockDb),
  );
});

describe('appointment reconciliation service', () => {
  it('finds reconciliation-needed appointments by tenant and status', async () => {
    const list = selectChain<Appointment>([baseAppointment]);
    mockDb.select.mockReturnValueOnce(list);

    const appointments = await withTenant('tenant-a', () =>
      findAppointmentsNeedingReconciliation({
        tenantId: 'tenant-a',
        statuses: ['local_cancelled_external_cancel_failed'],
        now: new Date('2026-05-13T12:06:00.000Z'),
      }),
    );

    expect(appointments).toEqual([baseAppointment]);
    expect(list.where).toHaveBeenCalledTimes(1);
    expect(list.limit).toHaveBeenCalledWith(100);
  });

  it('updates retry metadata when marking reconciliation retrying', async () => {
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([baseAppointment]));
    const update = updateChain<Appointment>([baseAppointment]);
    mockDb.update.mockReturnValueOnce(update);

    await withTenant('tenant-a', () =>
      markAppointmentReconciliationRetrying({
        tenantId: 'tenant-a',
        appointmentId: baseAppointment.id,
        lastError: 'Still failing',
        retryDelayMs: 10 * 60_000,
        now: new Date('2026-05-13T13:00:00.000Z'),
      }),
    );

    const updatePayload = update.set.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
      updatedAt?: unknown;
    };
    expect(updatePayload.updatedAt).toEqual(new Date('2026-05-13T13:00:00.000Z'));
    expect(updatePayload.metadata).toMatchObject({
      reconciliation: {
        status: 'local_cancelled_external_cancel_failed',
        workflowState: 'retrying',
        retryCount: 2,
        lastAttemptAt: '2026-05-13T13:00:00.000Z',
        lastError: 'Still failing',
        nextRetryAt: '2026-05-13T13:10:00.000Z',
      },
    });
  });

  it('marks reconciliation pending with retry metadata defaults', async () => {
    const appointmentWithoutReconciliation = {
      ...baseAppointment,
      metadata: { source: 'appointments.book' },
    };
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([appointmentWithoutReconciliation]));
    const update = updateChain<Appointment>([appointmentWithoutReconciliation]);
    mockDb.update.mockReturnValueOnce(update);

    await withTenant('tenant-a', () =>
      markAppointmentReconciliationPending({
        tenantId: 'tenant-a',
        appointmentId: baseAppointment.id,
        status: 'external_created_local_confirm_failed',
        reason: 'Local finalization failed',
        now: new Date('2026-05-13T13:00:00.000Z'),
      }),
    );

    const updatePayload = update.set.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
    };
    expect(updatePayload.metadata).toMatchObject({
      source: 'appointments.book',
      reconciliation: {
        status: 'external_created_local_confirm_failed',
        workflowState: 'pending',
        retryCount: 0,
        lastError: 'Local finalization failed',
        detectedAt: '2026-05-13T13:00:00.000Z',
      },
    });
  });

  it('archives reconciliation metadata when resolved', async () => {
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([baseAppointment]));
    const update = updateChain<Appointment>([baseAppointment]);
    mockDb.update.mockReturnValueOnce(update);

    await withTenant('tenant-a', () =>
      markAppointmentReconciliationResolved({
        tenantId: 'tenant-a',
        appointmentId: baseAppointment.id,
        now: new Date('2026-05-13T14:00:00.000Z'),
      }),
    );

    const updatePayload = update.set.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
    };
    expect(updatePayload.metadata).not.toHaveProperty('reconciliation');
    expect(updatePayload.metadata).toMatchObject({
      source: 'appointments.cancel',
      reconciliationHistory: [
        {
          status: 'local_cancelled_external_cancel_failed',
          workflowState: 'resolved',
          resolvedAt: '2026-05-13T14:00:00.000Z',
        },
      ],
    });
  });

  it('records final error when reconciliation fails', async () => {
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([baseAppointment]));
    const update = updateChain<Appointment>([baseAppointment]);
    mockDb.update.mockReturnValueOnce(update);

    await withTenant('tenant-a', () =>
      markAppointmentReconciliationFailed({
        tenantId: 'tenant-a',
        appointmentId: baseAppointment.id,
        finalError: 'Manual intervention required',
        now: new Date('2026-05-13T15:00:00.000Z'),
      }),
    );

    const updatePayload = update.set.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
    };
    expect(updatePayload.metadata).toMatchObject({
      reconciliation: {
        status: 'local_cancelled_external_cancel_failed',
        workflowState: 'failed',
        retryCount: 1,
        lastAttemptAt: '2026-05-13T15:00:00.000Z',
        lastError: 'Manual intervention required',
        nextRetryAt: null,
        failedAt: '2026-05-13T15:00:00.000Z',
      },
    });
  });

  it('rejects cross-tenant reconciliation reads and writes', async () => {
    await expect(
      withTenant('tenant-a', () => findAppointmentsNeedingReconciliation({ tenantId: 'tenant-b' })),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      withTenant('tenant-a', () =>
        markAppointmentReconciliationFailed({
          tenantId: 'tenant-b',
          appointmentId: baseAppointment.id,
          finalError: 'No access',
        }),
      ),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
