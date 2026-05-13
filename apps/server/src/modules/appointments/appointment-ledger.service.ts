import { and, desc, eq, gt, gte, lt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { appointmentHolds, appointments } from '../../db/schema.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { generateId } from '../../lib/crypto.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import type { InferSelectModel } from 'drizzle-orm';

export type Appointment = InferSelectModel<typeof appointments>;
export type AppointmentHold = InferSelectModel<typeof appointmentHolds>;
export type AppointmentStatus = Appointment['status'];
export type AppointmentHoldStatus = AppointmentHold['status'];

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

export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  assertTenantAccess(input.tenantId);
  assertValidTimeRange(input.startAt, input.endAt);
  assertIdempotencyKey(input.idempotencyKey);

  const existing = await findAppointmentByIdempotencyKey(input.tenantId, input.idempotencyKey);
  if (existing) return existing;

  const [appointment] = await db
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
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
    })
    .returning();

  return appointment;
}

export async function findAppointmentByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string,
): Promise<Appointment | null> {
  assertTenantAccess(tenantId);
  assertIdempotencyKey(idempotencyKey);

  const [appointment] = await db
    .select()
    .from(appointments)
    .where(
      and(eq(appointments.tenantId, tenantId), eq(appointments.idempotencyKey, idempotencyKey)),
    )
    .limit(1);

  return appointment ?? null;
}

export async function getAppointment(
  tenantId: string,
  appointmentId: string,
): Promise<Appointment> {
  assertTenantAccess(tenantId);

  const [appointment] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)))
    .limit(1);

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  return appointment;
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

  return await db
    .select()
    .from(appointments)
    .where(and(...predicates))
    .orderBy(desc(appointments.startAt))
    .limit(limit);
}

export async function updateAppointmentStatus(input: {
  tenantId: string;
  appointmentId: string;
  status: AppointmentStatus;
}): Promise<Appointment> {
  const current = await getAppointment(input.tenantId, input.appointmentId);
  const allowed = ALLOWED_APPOINTMENT_TRANSITIONS[current.status];
  if (!allowed.includes(input.status)) {
    throw new ValidationError(
      `Cannot transition appointment from ${current.status} to ${input.status}`,
    );
  }

  const [updated] = await db
    .update(appointments)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, input.appointmentId)))
    .returning();

  if (!updated) {
    throw new NotFoundError('Appointment not found');
  }

  return updated;
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

  const existing = await findAppointmentHoldByIdempotencyKey(input.tenantId, input.idempotencyKey);
  if (existing) return existing;

  const [hold] = await db
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
}

export async function findAppointmentHoldByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string,
): Promise<AppointmentHold | null> {
  assertTenantAccess(tenantId);
  assertIdempotencyKey(idempotencyKey);

  const [hold] = await db
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

  return await db
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
    .limit(limit);
}
