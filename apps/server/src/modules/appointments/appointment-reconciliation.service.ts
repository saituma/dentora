import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { appointments } from '../../db/schema.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { ValidationError } from '../../lib/errors.js';
import { getAppointment, type Appointment } from './appointment-ledger.service.js';

export const SUPPORTED_RECONCILIATION_STATUSES = [
  'external_created_local_confirm_failed',
  'local_cancelled_external_cancel_failed',
  'local_rescheduled_external_reschedule_failed',
] as const;

export type AppointmentReconciliationStatus = (typeof SUPPORTED_RECONCILIATION_STATUSES)[number];
export type AppointmentReconciliationState = 'pending' | 'retrying' | 'resolved' | 'failed';

export interface FindAppointmentsNeedingReconciliationInput {
  tenantId: string;
  statuses?: AppointmentReconciliationStatus[];
  now?: Date;
  limit?: number;
}

export interface MarkReconciliationPendingInput {
  tenantId: string;
  appointmentId: string;
  status: AppointmentReconciliationStatus;
  reason?: string;
  now?: Date;
}

export interface MarkReconciliationRetryingInput {
  tenantId: string;
  appointmentId: string;
  lastError: string;
  retryDelayMs?: number;
  now?: Date;
}

export interface MarkReconciliationResolvedInput {
  tenantId: string;
  appointmentId: string;
  now?: Date;
}

export interface MarkReconciliationFailedInput {
  tenantId: string;
  appointmentId: string;
  finalError: string;
  now?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function appointmentMetadata(appointment: Appointment): Record<string, unknown> {
  return isRecord(appointment.metadata) ? appointment.metadata : {};
}

function reconciliationMetadata(appointment: Appointment): Record<string, unknown> {
  const metadata = appointmentMetadata(appointment);
  return isRecord(metadata.reconciliation) ? metadata.reconciliation : {};
}

function retryCountFrom(reconciliation: Record<string, unknown>): number {
  return typeof reconciliation.retryCount === 'number' && Number.isFinite(reconciliation.retryCount)
    ? Math.max(0, Math.floor(reconciliation.retryCount))
    : 0;
}

function getHistory(metadata: Record<string, unknown>): unknown[] {
  return Array.isArray(metadata.reconciliationHistory) ? metadata.reconciliationHistory : [];
}

export async function findAppointmentsNeedingReconciliation(
  input: FindAppointmentsNeedingReconciliationInput,
): Promise<Appointment[]> {
  assertTenantAccess(input.tenantId);
  const statuses = input.statuses?.length ? input.statuses : [...SUPPORTED_RECONCILIATION_STATUSES];
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);

  return await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, input.tenantId),
        inArray(sql<string>`${appointments.metadata}->'reconciliation'->>'status'`, statuses),
        sql`coalesce((${appointments.metadata}->'reconciliation'->>'nextRetryAt')::timestamptz, '-infinity'::timestamptz) <= ${now}`,
      ),
    )
    .limit(limit);
}

export async function markAppointmentReconciliationPending(
  input: MarkReconciliationPendingInput,
): Promise<void> {
  assertTenantAccess(input.tenantId);
  if (!SUPPORTED_RECONCILIATION_STATUSES.includes(input.status)) {
    throw new ValidationError('Unsupported appointment reconciliation status');
  }

  const current = await getAppointment(input.tenantId, input.appointmentId);
  const metadata = appointmentMetadata(current);
  const previous = reconciliationMetadata(current);
  const now = input.now ?? new Date();

  await db
    .update(appointments)
    .set({
      metadata: {
        ...metadata,
        reconciliation: {
          ...previous,
          status: input.status,
          workflowState: 'pending',
          retryCount: retryCountFrom(previous),
          lastAttemptAt: previous.lastAttemptAt,
          lastError: input.reason ?? previous.lastError,
          nextRetryAt: previous.nextRetryAt,
          detectedAt:
            typeof previous.detectedAt === 'string' ? previous.detectedAt : now.toISOString(),
        },
      },
      updatedAt: now,
    })
    .where(
      and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, input.appointmentId)),
    );
}

export async function markAppointmentReconciliationRetrying(
  input: MarkReconciliationRetryingInput,
): Promise<void> {
  assertTenantAccess(input.tenantId);
  const current = await getAppointment(input.tenantId, input.appointmentId);
  const metadata = appointmentMetadata(current);
  const previous = reconciliationMetadata(current);
  const now = input.now ?? new Date();
  const nextRetryAt = new Date(now.getTime() + Math.max(input.retryDelayMs ?? 5 * 60_000, 0));

  await db
    .update(appointments)
    .set({
      metadata: {
        ...metadata,
        reconciliation: {
          ...previous,
          workflowState: 'retrying',
          retryCount: retryCountFrom(previous) + 1,
          lastAttemptAt: now.toISOString(),
          lastError: input.lastError,
          nextRetryAt: nextRetryAt.toISOString(),
        },
      },
      updatedAt: now,
    })
    .where(
      and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, input.appointmentId)),
    );
}

export async function markAppointmentReconciliationResolved(
  input: MarkReconciliationResolvedInput,
): Promise<void> {
  assertTenantAccess(input.tenantId);
  const current = await getAppointment(input.tenantId, input.appointmentId);
  const metadata = appointmentMetadata(current);
  const previous = reconciliationMetadata(current);
  const now = input.now ?? new Date();
  const metadataWithoutReconciliation = { ...metadata };
  delete metadataWithoutReconciliation.reconciliation;

  await db
    .update(appointments)
    .set({
      metadata: {
        ...metadataWithoutReconciliation,
        reconciliationHistory: [
          ...getHistory(metadata),
          {
            ...previous,
            workflowState: 'resolved',
            resolvedAt: now.toISOString(),
          },
        ],
      },
      updatedAt: now,
    })
    .where(
      and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, input.appointmentId)),
    );
}

export async function markAppointmentReconciliationFailed(
  input: MarkReconciliationFailedInput,
): Promise<void> {
  assertTenantAccess(input.tenantId);
  const current = await getAppointment(input.tenantId, input.appointmentId);
  const metadata = appointmentMetadata(current);
  const previous = reconciliationMetadata(current);
  const now = input.now ?? new Date();

  await db
    .update(appointments)
    .set({
      metadata: {
        ...metadata,
        reconciliation: {
          ...previous,
          workflowState: 'failed',
          retryCount: retryCountFrom(previous),
          lastAttemptAt: now.toISOString(),
          lastError: input.finalError,
          nextRetryAt: null,
          failedAt: now.toISOString(),
        },
      },
      updatedAt: now,
    })
    .where(
      and(eq(appointments.tenantId, input.tenantId), eq(appointments.id, input.appointmentId)),
    );
}
