import { and, desc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { appointmentHolds, appointments } from '../../db/schema.js';
import {
  assertTenantAccess,
  getTenantExecutionContext,
  withTenantTransaction,
} from '../../db/tenant-context.js';
import { generateId } from '../../lib/crypto.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { createStaffReviewItemSafely } from '../staff-review/staff-review.service.js';
import type { InferSelectModel } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema.js';
import type { SchedulingProviderKey } from '../pms/domain/appointment.types.js';

export type Appointment = InferSelectModel<typeof appointments>;
export type AppointmentHold = InferSelectModel<typeof appointmentHolds>;
export type AppointmentStatus = Appointment['status'];
export type AppointmentHoldStatus = AppointmentHold['status'];
type AppDb = NodePgDatabase<typeof schema>;
type AppDbTransaction = Parameters<Parameters<AppDb['transaction']>[0]>[0];
type AppointmentLedgerDb = AppDb | AppDbTransaction;

export interface CreateAppointmentInput {
  tenantId: string;
  patientId?: string | null;
  serviceId?: string | null;
  staffId?: string | null;
  callSessionId?: string | null;
  status?: AppointmentStatus;
  startAt: Date;
  endAt: Date;
  timezone: string;
  calendarIntegrationId?: string | null;
  externalCalendarEventId?: string | null;
  externalProvider?: SchedulingProviderKey | null;
  externalAppointmentId?: string | null;
  externalPatientId?: string | null;
  externalClinicianId?: string | null;
  externalRoomId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAppointmentHoldInput {
  tenantId: string;
  patientId?: string | null;
  serviceId?: string | null;
  staffId?: string | null;
  callSessionId?: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  calendarIntegrationId?: string | null;
  idempotencyKey: string;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ConfirmAppointmentHoldInput {
  tenantId: string;
  holdId: string;
  idempotencyKey: string;
  now?: Date;
}

export interface AttachExternalCalendarEventInput {
  tenantId: string;
  appointmentId: string;
  externalCalendarEventId: string;
  externalProvider?: SchedulingProviderKey | null;
  externalAppointmentId?: string | null;
  externalPatientId?: string | null;
  externalClinicianId?: string | null;
  externalRoomId?: string | null;
}

export interface MarkAppointmentReconciliationNeededInput {
  tenantId: string;
  appointmentId: string;
  externalCalendarEventId: string;
  externalProvider?: SchedulingProviderKey | null;
  externalAppointmentId?: string | null;
  externalPatientId?: string | null;
  externalClinicianId?: string | null;
  externalRoomId?: string | null;
  reason: string;
}

export interface BeginAppointmentCancellationInput {
  tenantId: string;
  externalCalendarEventId: string;
}

export interface BeginAppointmentRescheduleInput {
  tenantId: string;
  externalCalendarEventId: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
}

export interface MarkAppointmentExternalSyncInput {
  tenantId: string;
  appointmentId: string;
  operation: 'cancel' | 'reschedule';
  status:
    | 'external_cancel_synced'
    | 'local_cancelled_external_cancel_failed'
    | 'external_reschedule_synced'
    | 'local_rescheduled_external_reschedule_failed';
  reason?: string;
}

export interface LedgerAvailabilityBlocker {
  startAt: Date;
  endAt: Date;
  source: 'appointment' | 'hold';
}

export interface ExpireAppointmentHoldsInput {
  tenantId: string;
  now?: Date;
  limit?: number;
}

const ALLOWED_APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  held: ['scheduled', 'cancelled'],
  scheduled: ['confirmed', 'cancelled', 'completed', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

function assertValidTimeRange(startAt: Date, endAt: Date): void {
  if (
    !Number.isFinite(startAt.getTime()) ||
    !Number.isFinite(endAt.getTime()) ||
    endAt <= startAt
  ) {
    throw new ValidationError('Appointment start/end times are invalid');
  }
}

function assertIdempotencyKey(idempotencyKey: string): void {
  if (!idempotencyKey.trim()) {
    throw new ValidationError('Appointment idempotency key is required');
  }
}

async function assertNoConflictingAppointments(input: {
  executor?: AppointmentLedgerDb;
  tenantId: string;
  startAt: Date;
  endAt: Date;
  serviceId?: string | null;
  staffId?: string | null;
  excludeAppointmentId?: string;
}): Promise<void> {
  const predicates = [
    eq(appointments.tenantId, input.tenantId),
    inArray(appointments.status, ['scheduled', 'confirmed']),
    lt(appointments.startAt, input.endAt),
    gt(appointments.endAt, input.startAt),
  ];

  if (input.serviceId) {
    predicates.push(eq(appointments.serviceId, input.serviceId));
  }

  if (input.staffId) {
    predicates.push(eq(appointments.staffId, input.staffId));
  }

  const executor = input.executor ?? db;
  const conflicts = await executor
    .select()
    .from(appointments)
    .where(and(...predicates))
    .limit(1);
  const conflict = conflicts.find((appointment) => appointment.id !== input.excludeAppointmentId);
  if (conflict) {
    throw new ValidationError('Appointment slot conflicts with an existing appointment');
  }
}

function bookingLockKey(input: {
  tenantId: string;
  serviceId?: string | null;
  staffId?: string | null;
  startAt: Date;
}): string {
  const resource = input.staffId ?? input.serviceId ?? 'tenant';
  const day = input.startAt.toISOString().slice(0, 10);
  return `${input.tenantId}:${resource}:${day}`;
}

async function acquireBookingLock(
  executor: AppointmentLedgerDb,
  input: {
    tenantId: string;
    serviceId?: string | null;
    staffId?: string | null;
    startAt: Date;
  },
): Promise<void> {
  await executor.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${bookingLockKey(input)}, 0))`,
  );
}

async function withAppointmentLedgerTransaction<T>(
  tenantId: string,
  callback: (tx: AppDbTransaction) => Promise<T>,
): Promise<T> {
  const activeContext = getTenantExecutionContext();
  assertTenantAccess(tenantId);
  return await withTenantTransaction(
    {
      tenantId,
      correlationId: activeContext?.correlationId,
      source: activeContext?.source ?? 'worker',
    },
    callback,
  );
}

async function findAppointmentByIdempotencyKeyWithExecutor(
  executor: AppointmentLedgerDb,
  tenantId: string,
  idempotencyKey: string,
): Promise<Appointment | null> {
  const [appointment] = await executor
    .select()
    .from(appointments)
    .where(
      and(eq(appointments.tenantId, tenantId), eq(appointments.idempotencyKey, idempotencyKey)),
    )
    .limit(1);

  return appointment ?? null;
}

async function getAppointmentWithExecutor(
  executor: AppointmentLedgerDb,
  tenantId: string,
  appointmentId: string,
): Promise<Appointment> {
  const [appointment] = await executor
    .select()
    .from(appointments)
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)))
    .limit(1);

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  return appointment;
}

async function getAppointmentByExternalCalendarEventIdWithExecutor(
  executor: AppointmentLedgerDb,
  tenantId: string,
  externalCalendarEventId: string,
): Promise<Appointment> {
  const [appointment] = await executor
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.externalCalendarEventId, externalCalendarEventId),
      ),
    )
    .limit(1);

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  return appointment;
}

export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  assertTenantAccess(input.tenantId);
  assertValidTimeRange(input.startAt, input.endAt);
  assertIdempotencyKey(input.idempotencyKey);

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const existing = await findAppointmentByIdempotencyKeyWithExecutor(
      tx,
      input.tenantId,
      input.idempotencyKey,
    );
    if (existing) return existing;
    await assertNoConflictingAppointments({
      executor: tx,
      tenantId: input.tenantId,
      startAt: input.startAt,
      endAt: input.endAt,
      serviceId: input.serviceId,
      staffId: input.staffId,
    });

    const [appointment] = await tx
      .insert(appointments)
      .values({
        id: generateId(),
        tenantId: input.tenantId,
        patientId: input.patientId ?? null,
        serviceId: input.serviceId ?? null,
        staffId: input.staffId ?? null,
        callSessionId: input.callSessionId ?? null,
        status: input.status ?? 'scheduled',
        startAt: input.startAt,
        endAt: input.endAt,
        timezone: input.timezone,
        calendarIntegrationId: input.calendarIntegrationId ?? null,
        externalCalendarEventId: input.externalCalendarEventId ?? null,
        externalProvider: input.externalProvider ?? null,
        externalAppointmentId: input.externalAppointmentId ?? null,
        externalPatientId: input.externalPatientId ?? null,
        externalClinicianId: input.externalClinicianId ?? null,
        externalRoomId: input.externalRoomId ?? null,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      })
      .returning();

    return appointment;
  });
}

export async function findAppointmentByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string,
): Promise<Appointment | null> {
  assertTenantAccess(tenantId);
  assertIdempotencyKey(idempotencyKey);

  return await withAppointmentLedgerTransaction(tenantId, (tx) =>
    findAppointmentByIdempotencyKeyWithExecutor(tx, tenantId, idempotencyKey),
  );
}

export async function getAppointment(
  tenantId: string,
  appointmentId: string,
): Promise<Appointment> {
  assertTenantAccess(tenantId);

  return await withAppointmentLedgerTransaction(tenantId, (tx) =>
    getAppointmentWithExecutor(tx, tenantId, appointmentId),
  );
}

export async function getAppointmentByExternalCalendarEventId(
  tenantId: string,
  externalCalendarEventId: string,
): Promise<Appointment> {
  assertTenantAccess(tenantId);
  if (!externalCalendarEventId.trim()) {
    throw new ValidationError('External calendar event id is required');
  }

  return await withAppointmentLedgerTransaction(tenantId, (tx) =>
    getAppointmentByExternalCalendarEventIdWithExecutor(tx, tenantId, externalCalendarEventId),
  );
}

export async function listAppointments(input: {
  tenantId: string;
  from: Date;
  to: Date;
  status?: AppointmentStatus;
  limit?: number;
}): Promise<Appointment[]> {
  assertTenantAccess(input.tenantId);
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const predicates = [
    eq(appointments.tenantId, input.tenantId),
    gte(appointments.startAt, input.from),
    lt(appointments.startAt, input.to),
  ];

  if (input.status) {
    predicates.push(eq(appointments.status, input.status));
  }

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) =>
    tx
      .select()
      .from(appointments)
      .where(and(...predicates))
      .orderBy(desc(appointments.startAt))
      .limit(limit),
  );
}

export async function updateAppointmentStatus(input: {
  tenantId: string;
  appointmentId: string;
  status: AppointmentStatus;
}): Promise<Appointment> {
  assertTenantAccess(input.tenantId);

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const current = await getAppointmentWithExecutor(tx, input.tenantId, input.appointmentId);
    const allowed = ALLOWED_APPOINTMENT_TRANSITIONS[current.status];
    if (!allowed.includes(input.status)) {
      throw new ValidationError(
        `Cannot transition appointment from ${current.status} to ${input.status}`,
      );
    }

    const [updated] = await tx
      .update(appointments)
      .set({ status: input.status, updatedAt: new Date() })
      .where(
        and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, input.appointmentId)),
      )
      .returning();

    if (!updated) {
      throw new NotFoundError('Appointment not found');
    }

    return updated;
  });
}

export async function attachExternalCalendarEvent(
  input: AttachExternalCalendarEventInput,
): Promise<Appointment> {
  assertTenantAccess(input.tenantId);
  if (!input.externalCalendarEventId.trim()) {
    throw new ValidationError('External calendar event id is required');
  }

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const current = await getAppointmentWithExecutor(tx, input.tenantId, input.appointmentId);
    if (current.status !== 'scheduled') {
      throw new ValidationError(
        'Only scheduled appointments can be confirmed with an external event',
      );
    }

    const [updated] = await tx
      .update(appointments)
      .set({
        status: 'confirmed',
        externalCalendarEventId: input.externalCalendarEventId,
        externalProvider: input.externalProvider ?? 'google_calendar',
        externalAppointmentId: input.externalAppointmentId ?? input.externalCalendarEventId,
        externalPatientId: input.externalPatientId ?? current.externalPatientId,
        externalClinicianId: input.externalClinicianId ?? current.externalClinicianId,
        externalRoomId: input.externalRoomId ?? current.externalRoomId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, input.appointmentId)),
      )
      .returning();

    if (!updated) {
      throw new NotFoundError('Appointment not found');
    }

    return updated;
  });
}

export async function markAppointmentReconciliationNeeded(
  input: MarkAppointmentReconciliationNeededInput,
): Promise<void> {
  assertTenantAccess(input.tenantId);
  if (!input.externalCalendarEventId.trim()) {
    throw new ValidationError('External calendar event id is required');
  }

  await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const current = await getAppointmentWithExecutor(tx, input.tenantId, input.appointmentId);
    const metadata =
      current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
        ? (current.metadata as Record<string, unknown>)
        : {};

    await tx
      .update(appointments)
      .set({
        metadata: {
          ...metadata,
          reconciliation: {
            status: 'external_created_local_confirm_failed',
            externalCalendarEventId: input.externalCalendarEventId,
            externalProvider: input.externalProvider ?? 'google_calendar',
            externalAppointmentId: input.externalAppointmentId ?? input.externalCalendarEventId,
            externalPatientId: input.externalPatientId ?? current.externalPatientId,
            externalClinicianId: input.externalClinicianId ?? current.externalClinicianId,
            externalRoomId: input.externalRoomId ?? current.externalRoomId,
            reason: input.reason,
            detectedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(
        and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, input.appointmentId)),
      );
  });
  await createStaffReviewItemSafely({
    tenantId: input.tenantId,
    type: 'booking_failure',
    severity: 'high',
    source: 'system',
    relatedAppointmentId: input.appointmentId,
    reasonCode: 'BOOKING_EXTERNAL_CREATED_LOCAL_CONFIRM_FAILED',
    message: 'Booking created an external calendar event but local confirmation needs review.',
    metadata: {
      externalCalendarEventAttached: Boolean(input.externalCalendarEventId),
      externalProvider: input.externalProvider ?? 'google_calendar',
    },
    dedupeKey: `booking_reconciliation_needed:${input.appointmentId}`,
  });
}

function getAppointmentMetadata(appointment: Appointment): Record<string, unknown> {
  return appointment.metadata &&
    typeof appointment.metadata === 'object' &&
    !Array.isArray(appointment.metadata)
    ? (appointment.metadata as Record<string, unknown>)
    : {};
}

export async function markAppointmentExternalSyncState(
  input: MarkAppointmentExternalSyncInput,
): Promise<void> {
  assertTenantAccess(input.tenantId);
  await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const current = await getAppointmentWithExecutor(tx, input.tenantId, input.appointmentId);
    const metadata = getAppointmentMetadata(current);

    await tx
      .update(appointments)
      .set({
        metadata: {
          ...metadata,
          reconciliation: {
            status: input.status,
            operation: input.operation,
            externalCalendarEventId: current.externalCalendarEventId,
            reason: input.reason,
            detectedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(
        and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, input.appointmentId)),
      );
  });
}

export async function beginAppointmentCancellationByExternalEventId(
  input: BeginAppointmentCancellationInput,
): Promise<Appointment> {
  assertTenantAccess(input.tenantId);
  if (!input.externalCalendarEventId.trim()) {
    throw new ValidationError('External calendar event id is required');
  }

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const current = await getAppointmentByExternalCalendarEventIdWithExecutor(
      tx,
      input.tenantId,
      input.externalCalendarEventId,
    );
    if (current.status !== 'scheduled' && current.status !== 'confirmed') {
      throw new ValidationError(`Cannot cancel appointment with status ${current.status}`);
    }

    const metadata = getAppointmentMetadata(current);
    const [updated] = await tx
      .update(appointments)
      .set({
        status: 'cancelled',
        metadata: {
          ...metadata,
          reconciliation: {
            status: 'external_cancel_pending',
            operation: 'cancel',
            previousStatus: current.status,
            externalCalendarEventId: current.externalCalendarEventId,
            externalProvider: current.externalProvider,
            externalAppointmentId: current.externalAppointmentId,
            detectedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, current.id)))
      .returning();

    if (!updated) {
      throw new NotFoundError('Appointment not found');
    }

    return updated;
  });
}

export async function beginAppointmentRescheduleByExternalEventId(
  input: BeginAppointmentRescheduleInput,
): Promise<Appointment> {
  assertTenantAccess(input.tenantId);
  assertValidTimeRange(input.startAt, input.endAt);

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const current = await getAppointmentByExternalCalendarEventIdWithExecutor(
      tx,
      input.tenantId,
      input.externalCalendarEventId,
    );
    if (current.status !== 'scheduled' && current.status !== 'confirmed') {
      throw new ValidationError(`Cannot reschedule appointment with status ${current.status}`);
    }

    await acquireBookingLock(tx, {
      tenantId: input.tenantId,
      serviceId: current.serviceId,
      staffId: current.staffId,
      startAt: input.startAt,
    });
    await assertNoConflictingAppointments({
      executor: tx,
      tenantId: input.tenantId,
      startAt: input.startAt,
      endAt: input.endAt,
      serviceId: current.serviceId,
      staffId: current.staffId,
      excludeAppointmentId: current.id,
    });

    const metadata = getAppointmentMetadata(current);
    const [updated] = await tx
      .update(appointments)
      .set({
        startAt: input.startAt,
        endAt: input.endAt,
        timezone: input.timezone,
        metadata: {
          ...metadata,
          reconciliation: {
            status: 'external_reschedule_pending',
            operation: 'reschedule',
            previousStartAt: current.startAt.toISOString(),
            previousEndAt: current.endAt.toISOString(),
            externalCalendarEventId: current.externalCalendarEventId,
            externalProvider: current.externalProvider,
            externalAppointmentId: current.externalAppointmentId,
            detectedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, current.id)))
      .returning();

    if (!updated) {
      throw new NotFoundError('Appointment not found');
    }

    return updated;
  });
}

export async function createAppointmentHold(
  input: CreateAppointmentHoldInput,
): Promise<AppointmentHold> {
  assertTenantAccess(input.tenantId);
  assertValidTimeRange(input.startAt, input.endAt);
  assertIdempotencyKey(input.idempotencyKey);
  if (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= new Date()) {
    throw new ValidationError('Appointment hold expiry must be in the future');
  }

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const existing = await findAppointmentHoldByIdempotencyKeyWithExecutor(
      tx,
      input.tenantId,
      input.idempotencyKey,
    );
    if (existing) return existing;

    const [hold] = await tx
      .insert(appointmentHolds)
      .values({
        id: generateId(),
        tenantId: input.tenantId,
        patientId: input.patientId ?? null,
        serviceId: input.serviceId ?? null,
        staffId: input.staffId ?? null,
        callSessionId: input.callSessionId ?? null,
        status: 'active',
        startAt: input.startAt,
        endAt: input.endAt,
        timezone: input.timezone,
        calendarIntegrationId: input.calendarIntegrationId ?? null,
        idempotencyKey: input.idempotencyKey,
        expiresAt: input.expiresAt,
        metadata: input.metadata ?? {},
      })
      .returning();

    return hold;
  });
}

async function findAppointmentHoldByIdempotencyKeyWithExecutor(
  executor: AppointmentLedgerDb,
  tenantId: string,
  idempotencyKey: string,
): Promise<AppointmentHold | null> {
  const [hold] = await executor
    .select()
    .from(appointmentHolds)
    .where(
      and(
        eq(appointmentHolds.tenantId, tenantId),
        eq(appointmentHolds.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  return hold ?? null;
}

async function getAppointmentHoldWithExecutor(
  executor: AppointmentLedgerDb,
  tenantId: string,
  holdId: string,
): Promise<AppointmentHold> {
  const [hold] = await executor
    .select()
    .from(appointmentHolds)
    .where(and(eq(appointmentHolds.tenantId, tenantId), eq(appointmentHolds.id, holdId)))
    .limit(1);

  if (!hold) {
    throw new NotFoundError('Appointment hold not found');
  }

  return hold;
}

export async function findAppointmentHoldByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string,
): Promise<AppointmentHold | null> {
  assertTenantAccess(tenantId);
  assertIdempotencyKey(idempotencyKey);

  return await withAppointmentLedgerTransaction(tenantId, (tx) =>
    findAppointmentHoldByIdempotencyKeyWithExecutor(tx, tenantId, idempotencyKey),
  );
}

export async function getAppointmentHold(
  tenantId: string,
  holdId: string,
): Promise<AppointmentHold> {
  assertTenantAccess(tenantId);

  return await withAppointmentLedgerTransaction(tenantId, (tx) =>
    getAppointmentHoldWithExecutor(tx, tenantId, holdId),
  );
}

export async function confirmAppointmentHold(
  input: ConfirmAppointmentHoldInput,
): Promise<Appointment> {
  assertTenantAccess(input.tenantId);
  assertIdempotencyKey(input.idempotencyKey);

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const existing = await findAppointmentByIdempotencyKeyWithExecutor(
      tx,
      input.tenantId,
      input.idempotencyKey,
    );
    if (existing) return existing;

    const [hold] = await tx
      .select()
      .from(appointmentHolds)
      .where(
        and(eq(appointmentHolds.tenantId, input.tenantId), eq(appointmentHolds.id, input.holdId)),
      )
      .limit(1);

    if (!hold) {
      throw new NotFoundError('Appointment hold not found');
    }

    await acquireBookingLock(tx, {
      tenantId: input.tenantId,
      serviceId: hold.serviceId,
      staffId: hold.staffId,
      startAt: hold.startAt,
    });

    const [existingInsideTransaction] = await tx
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, input.tenantId),
          eq(appointments.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existingInsideTransaction) return existingInsideTransaction;

    const now = input.now ?? new Date();
    if (hold.status !== 'active') {
      throw new ValidationError('Appointment hold is not active');
    }
    if (hold.expiresAt <= now) {
      throw new ValidationError('Appointment hold has expired');
    }

    await assertNoConflictingAppointments({
      executor: tx,
      tenantId: input.tenantId,
      startAt: hold.startAt,
      endAt: hold.endAt,
      serviceId: hold.serviceId,
      staffId: hold.staffId,
    });

    const [appointment] = await tx
      .insert(appointments)
      .values({
        id: generateId(),
        tenantId: input.tenantId,
        patientId: hold.patientId,
        serviceId: hold.serviceId,
        staffId: hold.staffId,
        callSessionId: hold.callSessionId,
        status: 'scheduled',
        startAt: hold.startAt,
        endAt: hold.endAt,
        timezone: hold.timezone,
        calendarIntegrationId: hold.calendarIntegrationId,
        externalCalendarEventId: null,
        externalProvider: null,
        externalAppointmentId: null,
        externalPatientId: null,
        externalClinicianId: null,
        externalRoomId: null,
        idempotencyKey: input.idempotencyKey,
        metadata: hold.metadata ?? {},
      })
      .returning();

    await tx
      .update(appointmentHolds)
      .set({ status: 'converted', updatedAt: new Date() })
      .where(
        and(eq(appointmentHolds.tenantId, input.tenantId), eq(appointmentHolds.id, input.holdId)),
      );

    return appointment;
  });
}

export async function listActiveAppointmentHolds(input: {
  tenantId: string;
  from: Date;
  to: Date;
  now?: Date;
  limit?: number;
}): Promise<AppointmentHold[]> {
  assertTenantAccess(input.tenantId);
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) =>
    tx
      .select()
      .from(appointmentHolds)
      .where(
        and(
          eq(appointmentHolds.tenantId, input.tenantId),
          eq(appointmentHolds.status, 'active'),
          gt(appointmentHolds.expiresAt, now),
          gte(appointmentHolds.startAt, input.from),
          lt(appointmentHolds.startAt, input.to),
        ),
      )
      .orderBy(desc(appointmentHolds.startAt))
      .limit(limit),
  );
}

export async function expireAppointmentHolds(
  input: ExpireAppointmentHoldsInput,
): Promise<AppointmentHold[]> {
  assertTenantAccess(input.tenantId);
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const expiredHolds = await tx
      .select({ id: appointmentHolds.id })
      .from(appointmentHolds)
      .where(
        and(
          eq(appointmentHolds.tenantId, input.tenantId),
          eq(appointmentHolds.status, 'active'),
          lte(appointmentHolds.expiresAt, now),
        ),
      )
      .limit(limit);

    if (expiredHolds.length === 0) return [];

    return await tx
      .update(appointmentHolds)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(
          eq(appointmentHolds.tenantId, input.tenantId),
          inArray(
            appointmentHolds.id,
            expiredHolds.map((hold) => hold.id),
          ),
        ),
      )
      .returning();
  });
}

export async function listLedgerAvailabilityBlockers(input: {
  tenantId: string;
  from: Date;
  to: Date;
  now?: Date;
}): Promise<LedgerAvailabilityBlocker[]> {
  assertTenantAccess(input.tenantId);
  const now = input.now ?? new Date();

  return await withAppointmentLedgerTransaction(input.tenantId, async (tx) => {
    const appointmentRows = await tx
      .select({
        startAt: appointments.startAt,
        endAt: appointments.endAt,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, input.tenantId),
          inArray(appointments.status, ['scheduled', 'confirmed']),
          lt(appointments.startAt, input.to),
          gt(appointments.endAt, input.from),
        ),
      );

    const holdRows = await tx
      .select({
        startAt: appointmentHolds.startAt,
        endAt: appointmentHolds.endAt,
      })
      .from(appointmentHolds)
      .where(
        and(
          eq(appointmentHolds.tenantId, input.tenantId),
          eq(appointmentHolds.status, 'active'),
          gt(appointmentHolds.expiresAt, now),
          lt(appointmentHolds.startAt, input.to),
          gt(appointmentHolds.endAt, input.from),
        ),
      );

    return [
      ...appointmentRows.map((row) => ({
        startAt: row.startAt,
        endAt: row.endAt,
        source: 'appointment' as const,
      })),
      ...holdRows.map((row) => ({
        startAt: row.startAt,
        endAt: row.endAt,
        source: 'hold' as const,
      })),
    ];
  });
}
