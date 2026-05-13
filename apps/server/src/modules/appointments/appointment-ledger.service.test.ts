import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { db } from '../../db/index.js';
import { runWithTenantContext } from '../../db/tenant-context.js';
import { AuthorizationError, ValidationError } from '../../lib/errors.js';
import {
  beginAppointmentCancellationByExternalEventId,
  beginAppointmentRescheduleByExternalEventId,
  createAppointment,
  createAppointmentHold,
  confirmAppointmentHold,
  getAppointment,
  listActiveAppointmentHolds,
  listLedgerAvailabilityBlockers,
  markAppointmentExternalSyncState,
  markAppointmentReconciliationNeeded,
  updateAppointmentStatus,
  type Appointment,
  type AppointmentHold,
} from './appointment-ledger.service.js';

interface SelectChain<T> {
  from: Mock;
  where: Mock;
  orderBy: Mock;
  limit: Mock;
  result: T[];
}

interface InsertChain<T> {
  values: Mock;
  returning: Mock;
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
  insert: Mock;
  update: Mock;
  execute: Mock;
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
  status: 'scheduled',
  startAt: new Date('2026-06-01T14:00:00.000Z'),
  endAt: new Date('2026-06-01T14:30:00.000Z'),
  timezone: 'America/New_York',
  calendarIntegrationId: 'integration-a',
  externalCalendarEventId: null,
  idempotencyKey: 'tenant-a:call-a:slot-1',
  metadata: {},
  createdAt: new Date('2026-05-13T00:00:00.000Z'),
  updatedAt: new Date('2026-05-13T00:00:00.000Z'),
};

const baseHold: AppointmentHold = {
  id: 'hold-a',
  tenantId: 'tenant-a',
  patientId: 'patient-a',
  serviceId: 'service-a',
  staffId: 'staff-a',
  callSessionId: 'call-a',
  status: 'active',
  startAt: new Date('2026-06-01T14:00:00.000Z'),
  endAt: new Date('2026-06-01T14:30:00.000Z'),
  timezone: 'America/New_York',
  calendarIntegrationId: 'integration-a',
  idempotencyKey: 'tenant-a:call-a:hold-1',
  expiresAt: new Date('2099-06-01T13:55:00.000Z'),
  metadata: {},
  createdAt: new Date('2026-05-13T00:00:00.000Z'),
  updatedAt: new Date('2026-05-13T00:00:00.000Z'),
};

function selectChain<T>(result: T[]): SelectChain<T> {
  const chain: SelectChain<T> = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    result,
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  return chain;
}

function selectWhereChain<T>(result: T[]): SelectChain<T> {
  const chain = selectChain<T>(result);
  chain.where.mockResolvedValue(result);
  return chain;
}

function insertChain<T>(result: T[]): InsertChain<T> {
  const chain: InsertChain<T> = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
    result,
  };
  chain.values.mockReturnValue(chain);
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
  mockDb.execute.mockResolvedValue(undefined);
});

describe('appointment ledger service', () => {
  it('creates tenant-scoped appointments', async () => {
    const existingLookup = selectChain<Appointment>([]);
    const conflictLookup = selectChain<Appointment>([]);
    const insert = insertChain<Appointment>([baseAppointment]);
    mockDb.select.mockReturnValueOnce(existingLookup).mockReturnValueOnce(conflictLookup);
    mockDb.insert.mockReturnValueOnce(insert);

    const appointment = await withTenant('tenant-a', () =>
      createAppointment({
        tenantId: 'tenant-a',
        patientId: 'patient-a',
        serviceId: 'service-a',
        staffId: 'staff-a',
        callSessionId: 'call-a',
        startAt: baseAppointment.startAt,
        endAt: baseAppointment.endAt,
        timezone: baseAppointment.timezone,
        calendarIntegrationId: 'integration-a',
        idempotencyKey: baseAppointment.idempotencyKey,
      }),
    );

    expect(appointment).toBe(baseAppointment);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        patientId: 'patient-a',
        serviceId: 'service-a',
        staffId: 'staff-a',
        callSessionId: 'call-a',
        idempotencyKey: baseAppointment.idempotencyKey,
      }),
    );
  });

  it('rejects cross-tenant appointment reads', async () => {
    await expect(
      withTenant('tenant-a', () => getAppointment('tenant-b', 'appointment-b')),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects appointment ledger operations without tenant context before opening a transaction', async () => {
    await expect(
      createAppointment({
        tenantId: 'tenant-a',
        startAt: baseAppointment.startAt,
        endAt: baseAppointment.endAt,
        timezone: baseAppointment.timezone,
        idempotencyKey: baseAppointment.idempotencyKey,
      }),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('returns an existing appointment for duplicate idempotency keys', async () => {
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([baseAppointment]));

    const appointment = await withTenant('tenant-a', () =>
      createAppointment({
        tenantId: 'tenant-a',
        startAt: baseAppointment.startAt,
        endAt: baseAppointment.endAt,
        timezone: baseAppointment.timezone,
        idempotencyKey: baseAppointment.idempotencyKey,
      }),
    );

    expect(appointment).toBe(baseAppointment);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('rejects expired holds during confirmation', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain<Appointment>([]))
      .mockReturnValueOnce(
        selectChain<AppointmentHold>([
          { ...baseHold, expiresAt: new Date('2000-01-01T00:00:00.000Z') },
        ]),
      )
      .mockReturnValueOnce(selectChain<Appointment>([]));

    await expect(
      withTenant('tenant-a', () =>
        confirmAppointmentHold({
          tenantId: 'tenant-a',
          holdId: baseHold.id,
          idempotencyKey: `${baseAppointment.idempotencyKey}:confirm`,
          now: new Date('2026-05-13T00:00:00.000Z'),
        }),
      ),
    ).rejects.toThrow(ValidationError);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant hold confirmation', async () => {
    await expect(
      withTenant('tenant-a', () =>
        confirmAppointmentHold({
          tenantId: 'tenant-b',
          holdId: baseHold.id,
          idempotencyKey: `${baseAppointment.idempotencyKey}:confirm`,
        }),
      ),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects double-booking against existing scheduled or confirmed appointments', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain<Appointment>([]))
      .mockReturnValueOnce(selectChain<AppointmentHold>([baseHold]))
      .mockReturnValueOnce(selectChain<Appointment>([]))
      .mockReturnValueOnce(
        selectChain<Appointment>([
          { ...baseAppointment, id: 'appointment-conflict', status: 'confirmed' },
        ]),
      );

    await expect(
      withTenant('tenant-a', () =>
        confirmAppointmentHold({
          tenantId: 'tenant-a',
          holdId: baseHold.id,
          idempotencyKey: `${baseAppointment.idempotencyKey}:confirm`,
          now: new Date('2026-05-13T00:00:00.000Z'),
        }),
      ),
    ).rejects.toThrow(ValidationError);
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('converts a valid hold to a scheduled local appointment', async () => {
    const confirmationKey = `${baseAppointment.idempotencyKey}:confirm`;
    const scheduledAppointment = {
      ...baseAppointment,
      status: 'scheduled' as const,
      externalCalendarEventId: null,
      idempotencyKey: confirmationKey,
    };
    const insert = insertChain<Appointment>([scheduledAppointment]);
    const holdUpdate = updateChain<AppointmentHold>([{ ...baseHold, status: 'converted' }]);
    mockDb.select
      .mockReturnValueOnce(selectChain<Appointment>([]))
      .mockReturnValueOnce(selectChain<AppointmentHold>([baseHold]))
      .mockReturnValueOnce(selectChain<Appointment>([]))
      .mockReturnValueOnce(selectChain<Appointment>([]));
    mockDb.insert.mockReturnValueOnce(insert);
    mockDb.update.mockReturnValueOnce(holdUpdate);

    const appointment = await withTenant('tenant-a', () =>
      confirmAppointmentHold({
        tenantId: 'tenant-a',
        holdId: baseHold.id,
        idempotencyKey: confirmationKey,
        now: new Date('2026-05-13T00:00:00.000Z'),
      }),
    );

    expect(appointment).toEqual(scheduledAppointment);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        status: 'scheduled',
        externalCalendarEventId: null,
        idempotencyKey: confirmationKey,
      }),
    );
    expect(holdUpdate.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'converted' }));
  });

  it('returns existing appointment for idempotent hold confirmation', async () => {
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([baseAppointment]));

    const appointment = await withTenant('tenant-a', () =>
      confirmAppointmentHold({
        tenantId: 'tenant-a',
        holdId: baseHold.id,
        idempotencyKey: baseAppointment.idempotencyKey,
      }),
    );

    expect(appointment).toBe(baseAppointment);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('does not mark a local appointment confirmed before external calendar attachment', async () => {
    const confirmationKey = `${baseAppointment.idempotencyKey}:confirm`;
    const scheduledAppointment = {
      ...baseAppointment,
      status: 'scheduled' as const,
      externalCalendarEventId: null,
      idempotencyKey: confirmationKey,
    };
    mockDb.select
      .mockReturnValueOnce(selectChain<Appointment>([]))
      .mockReturnValueOnce(selectChain<AppointmentHold>([baseHold]))
      .mockReturnValueOnce(selectChain<Appointment>([]))
      .mockReturnValueOnce(selectChain<Appointment>([]));
    mockDb.insert.mockReturnValueOnce(insertChain<Appointment>([scheduledAppointment]));
    mockDb.update.mockReturnValueOnce(
      updateChain<AppointmentHold>([{ ...baseHold, status: 'converted' }]),
    );

    const appointment = await withTenant('tenant-a', () =>
      confirmAppointmentHold({
        tenantId: 'tenant-a',
        holdId: baseHold.id,
        idempotencyKey: confirmationKey,
        now: new Date('2026-05-13T00:00:00.000Z'),
      }),
    );

    expect(appointment.status).toBe('scheduled');
    expect(appointment.externalCalendarEventId).toBeNull();
  });

  it('marks appointments for reconciliation when external calendar succeeds but local finalization fails', async () => {
    const update = updateChain<Appointment>([]);
    mockDb.select.mockReturnValueOnce(
      selectChain<Appointment>([
        {
          ...baseAppointment,
          metadata: { source: 'appointments.book' },
        },
      ]),
    );
    mockDb.update.mockReturnValueOnce(update);

    await withTenant('tenant-a', () =>
      markAppointmentReconciliationNeeded({
        tenantId: 'tenant-a',
        appointmentId: baseAppointment.id,
        externalCalendarEventId: 'google-event-a',
        reason: 'local update failed',
      }),
    );

    const updatePayload = update.set.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
      updatedAt?: unknown;
    };
    expect(updatePayload.updatedAt).toBeInstanceOf(Date);
    expect(updatePayload.metadata).toMatchObject({
      source: 'appointments.book',
      reconciliation: {
        status: 'external_created_local_confirm_failed',
        externalCalendarEventId: 'google-event-a',
        reason: 'local update failed',
      },
    });
  });

  it('filters active holds by expiry through the repository query', async () => {
    const list = selectChain<AppointmentHold>([baseHold]);
    mockDb.select.mockReturnValueOnce(list);
    const now = new Date('2026-05-13T12:00:00.000Z');

    const holds = await withTenant('tenant-a', () =>
      listActiveAppointmentHolds({
        tenantId: 'tenant-a',
        from: new Date('2026-06-01T00:00:00.000Z'),
        to: new Date('2026-06-02T00:00:00.000Z'),
        now,
      }),
    );

    expect(holds).toEqual([baseHold]);
    expect(list.where).toHaveBeenCalledTimes(1);
  });

  it('lists tenant-scoped ledger availability blockers from appointments and holds', async () => {
    const appointmentLookup = selectWhereChain<Pick<Appointment, 'startAt' | 'endAt'>>([
      {
        startAt: new Date('2026-06-01T14:00:00.000Z'),
        endAt: new Date('2026-06-01T14:30:00.000Z'),
      },
    ]);
    const holdLookup = selectWhereChain<Pick<AppointmentHold, 'startAt' | 'endAt'>>([
      {
        startAt: new Date('2026-06-01T15:00:00.000Z'),
        endAt: new Date('2026-06-01T15:30:00.000Z'),
      },
    ]);
    mockDb.select.mockReturnValueOnce(appointmentLookup).mockReturnValueOnce(holdLookup);

    const blockers = await withTenant('tenant-a', () =>
      listLedgerAvailabilityBlockers({
        tenantId: 'tenant-a',
        from: new Date('2026-06-01T00:00:00.000Z'),
        to: new Date('2026-06-02T00:00:00.000Z'),
        now: new Date('2026-05-13T12:00:00.000Z'),
      }),
    );

    expect(blockers).toEqual([
      {
        startAt: new Date('2026-06-01T14:00:00.000Z'),
        endAt: new Date('2026-06-01T14:30:00.000Z'),
        source: 'appointment',
      },
      {
        startAt: new Date('2026-06-01T15:00:00.000Z'),
        endAt: new Date('2026-06-01T15:30:00.000Z'),
        source: 'hold',
      },
    ]);
    expect(appointmentLookup.where).toHaveBeenCalledTimes(1);
    expect(holdLookup.where).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-tenant ledger availability blocker reads', async () => {
    await expect(
      withTenant('tenant-a', () =>
        listLedgerAvailabilityBlockers({
          tenantId: 'tenant-b',
          from: new Date('2026-06-01T00:00:00.000Z'),
          to: new Date('2026-06-02T00:00:00.000Z'),
        }),
      ),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects expired hold creation', async () => {
    await expect(
      withTenant('tenant-a', () =>
        createAppointmentHold({
          tenantId: 'tenant-a',
          startAt: baseHold.startAt,
          endAt: baseHold.endAt,
          timezone: baseHold.timezone,
          idempotencyKey: baseHold.idempotencyKey,
          expiresAt: new Date('2000-01-01T00:00:00.000Z'),
        }),
      ),
    ).rejects.toThrow(ValidationError);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('constrains appointment status transitions', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain<Appointment>([{ ...baseAppointment, status: 'completed' }]),
    );

    await expect(
      withTenant('tenant-a', () =>
        updateAppointmentStatus({
          tenantId: 'tenant-a',
          appointmentId: baseAppointment.id,
          status: 'cancelled',
        }),
      ),
    ).rejects.toThrow(ValidationError);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('allows valid appointment status transitions', async () => {
    const updated = { ...baseAppointment, status: 'confirmed' as const };
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([baseAppointment]));
    const update = updateChain<Appointment>([updated]);
    mockDb.update.mockReturnValueOnce(update);

    const appointment = await withTenant('tenant-a', () =>
      updateAppointmentStatus({
        tenantId: 'tenant-a',
        appointmentId: baseAppointment.id,
        status: 'confirmed',
      }),
    );

    expect(appointment).toEqual(updated);
    const updatePayload = update.set.mock.calls[0]?.[0] as {
      status?: string;
      updatedAt?: unknown;
    };
    expect(updatePayload.status).toBe('confirmed');
    expect(updatePayload.updatedAt).toBeInstanceOf(Date);
  });

  it('cancels scheduled or confirmed appointments by external calendar event id', async () => {
    const confirmedAppointment = {
      ...baseAppointment,
      status: 'confirmed' as const,
      externalCalendarEventId: 'google-event-a',
    };
    const cancelledAppointment = {
      ...confirmedAppointment,
      status: 'cancelled' as const,
    };
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([confirmedAppointment]));
    const update = updateChain<Appointment>([cancelledAppointment]);
    mockDb.update.mockReturnValueOnce(update);

    const appointment = await withTenant('tenant-a', () =>
      beginAppointmentCancellationByExternalEventId({
        tenantId: 'tenant-a',
        externalCalendarEventId: 'google-event-a',
      }),
    );

    expect(appointment).toEqual(cancelledAppointment);
    const updatePayload = update.set.mock.calls[0]?.[0] as {
      status?: string;
      metadata?: Record<string, unknown>;
      updatedAt?: unknown;
    };
    expect(updatePayload.status).toBe('cancelled');
    expect(updatePayload.updatedAt).toBeInstanceOf(Date);
    expect(updatePayload.metadata).toMatchObject({
      reconciliation: {
        status: 'external_cancel_pending',
        operation: 'cancel',
        previousStatus: 'confirmed',
        externalCalendarEventId: 'google-event-a',
      },
    });
  });

  it('rejects cross-tenant cancellation by external calendar event id', async () => {
    await expect(
      withTenant('tenant-a', () =>
        beginAppointmentCancellationByExternalEventId({
          tenantId: 'tenant-b',
          externalCalendarEventId: 'google-event-b',
        }),
      ),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects cancellation of already cancelled or completed appointments', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain<Appointment>([
        {
          ...baseAppointment,
          status: 'completed',
          externalCalendarEventId: 'google-event-a',
        },
      ]),
    );

    await expect(
      withTenant('tenant-a', () =>
        beginAppointmentCancellationByExternalEventId({
          tenantId: 'tenant-a',
          externalCalendarEventId: 'google-event-a',
        }),
      ),
    ).rejects.toThrow(ValidationError);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('marks detectable reconciliation state when external cancellation fails', async () => {
    const cancelledAppointment = {
      ...baseAppointment,
      status: 'cancelled' as const,
      externalCalendarEventId: 'google-event-a',
      metadata: {
        reconciliation: {
          status: 'external_cancel_pending',
          operation: 'cancel',
        },
      },
    };
    mockDb.select.mockReturnValueOnce(selectChain<Appointment>([cancelledAppointment]));
    const update = updateChain<Appointment>([cancelledAppointment]);
    mockDb.update.mockReturnValueOnce(update);

    await withTenant('tenant-a', () =>
      markAppointmentExternalSyncState({
        tenantId: 'tenant-a',
        appointmentId: cancelledAppointment.id,
        operation: 'cancel',
        status: 'local_cancelled_external_cancel_failed',
        reason: 'Google Calendar delete failed',
      }),
    );

    const updatePayload = update.set.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
      updatedAt?: unknown;
    };
    expect(updatePayload.updatedAt).toBeInstanceOf(Date);
    expect(updatePayload.metadata).toMatchObject({
      reconciliation: {
        status: 'local_cancelled_external_cancel_failed',
        operation: 'cancel',
        externalCalendarEventId: 'google-event-a',
        reason: 'Google Calendar delete failed',
      },
    });
  });

  it('rejects reschedule targets that overlap another scheduled appointment', async () => {
    const confirmedAppointment = {
      ...baseAppointment,
      status: 'confirmed' as const,
      externalCalendarEventId: 'google-event-a',
    };
    const conflictingAppointment = {
      ...baseAppointment,
      id: 'appointment-conflict',
      externalCalendarEventId: 'google-event-b',
    };
    mockDb.select
      .mockReturnValueOnce(selectChain<Appointment>([confirmedAppointment]))
      .mockReturnValueOnce(selectChain<Appointment>([conflictingAppointment]));

    await expect(
      withTenant('tenant-a', () =>
        beginAppointmentRescheduleByExternalEventId({
          tenantId: 'tenant-a',
          externalCalendarEventId: 'google-event-a',
          startAt: new Date('2026-06-01T14:00:00.000Z'),
          endAt: new Date('2026-06-01T14:30:00.000Z'),
          timezone: 'America/New_York',
        }),
      ),
    ).rejects.toThrow(ValidationError);
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('reschedules local appointments while preserving idempotency and external event tracking', async () => {
    const confirmedAppointment = {
      ...baseAppointment,
      status: 'confirmed' as const,
      externalCalendarEventId: 'google-event-a',
    };
    const rescheduledAppointment = {
      ...confirmedAppointment,
      startAt: new Date('2026-06-02T14:00:00.000Z'),
      endAt: new Date('2026-06-02T14:30:00.000Z'),
    };
    mockDb.select
      .mockReturnValueOnce(selectChain<Appointment>([confirmedAppointment]))
      .mockReturnValueOnce(selectChain<Appointment>([]));
    const update = updateChain<Appointment>([rescheduledAppointment]);
    mockDb.update.mockReturnValueOnce(update);

    const appointment = await withTenant('tenant-a', () =>
      beginAppointmentRescheduleByExternalEventId({
        tenantId: 'tenant-a',
        externalCalendarEventId: 'google-event-a',
        startAt: rescheduledAppointment.startAt,
        endAt: rescheduledAppointment.endAt,
        timezone: 'America/New_York',
      }),
    );

    expect(appointment).toEqual(rescheduledAppointment);
    const updatePayload = update.set.mock.calls[0]?.[0] as {
      startAt?: Date;
      endAt?: Date;
      timezone?: string;
      externalCalendarEventId?: string;
      idempotencyKey?: string;
      metadata?: Record<string, unknown>;
    };
    expect(updatePayload.startAt).toEqual(rescheduledAppointment.startAt);
    expect(updatePayload.endAt).toEqual(rescheduledAppointment.endAt);
    expect(updatePayload.timezone).toBe('America/New_York');
    expect(updatePayload.externalCalendarEventId).toBeUndefined();
    expect(updatePayload.idempotencyKey).toBeUndefined();
    expect(updatePayload.metadata).toMatchObject({
      reconciliation: {
        status: 'external_reschedule_pending',
        operation: 'reschedule',
        previousStartAt: '2026-06-01T14:00:00.000Z',
        previousEndAt: '2026-06-01T14:30:00.000Z',
        externalCalendarEventId: 'google-event-a',
      },
    });
  });
});
