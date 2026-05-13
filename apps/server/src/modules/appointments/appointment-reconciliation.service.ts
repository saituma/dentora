import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { appointments } from '../../db/schema.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import {
  cancelGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment,
} from '../integrations/google-calendar-appointments.js';
import { ValidationError } from '../../lib/errors.js';
import {
  attachExternalCalendarEvent,
  getAppointment,
  type Appointment,
} from './appointment-ledger.service.js';

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

export interface FindReconciliationRetryCandidatesInput {
  tenantId: string;
  now?: Date;
  limit?: number;
}

export interface MarkReconciliationPendingInput {
  tenantId: string;
  appointmentId: string;
  status: AppointmentReconciliationStatus;
  reason?: string;
  nextRetryAt?: Date | null;
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

export interface ProcessAppointmentReconciliationInput {
  tenantId: string;
  appointment: Appointment;
  now?: Date;
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

export interface ProcessDueAppointmentReconciliationsInput {
  tenantId: string;
  now?: Date;
  limit?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

export interface AppointmentReconciliationProcessResult {
  appointmentId: string;
  status: 'resolved' | 'retry_scheduled' | 'failed';
  reason?: string;
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

function stringFrom(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function reconciliationStatusFrom(
  reconciliation: Record<string, unknown>,
): AppointmentReconciliationStatus | null {
  const status = stringFrom(reconciliation.status);
  return SUPPORTED_RECONCILIATION_STATUSES.find((supported) => supported === status) ?? null;
}

function externalCalendarEventIdFrom(appointment: Appointment): string | null {
  if (appointment.externalCalendarEventId?.trim()) return appointment.externalCalendarEventId;
  const reconciliation = reconciliationMetadata(appointment);
  return stringFrom(reconciliation.externalCalendarEventId);
}

function retryDelayMs(retryCount: number, baseRetryDelayMs: number): number {
  const exponent = Math.min(Math.max(retryCount - 1, 0), 6);
  return baseRetryDelayMs * 2 ** exponent;
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

export async function findReconciliationRetryCandidates(
  input: FindReconciliationRetryCandidatesInput,
): Promise<Appointment[]> {
  return await findAppointmentsNeedingReconciliation({
    tenantId: input.tenantId,
    now: input.now,
    limit: input.limit,
    statuses: [...SUPPORTED_RECONCILIATION_STATUSES],
  });
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
          nextRetryAt:
            input.nextRetryAt === null
              ? null
              : (input.nextRetryAt?.toISOString() ?? previous.nextRetryAt),
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

async function scheduleRetry(input: {
  tenantId: string;
  appointmentId: string;
  status: AppointmentReconciliationStatus;
  retryCount: number;
  reason: string;
  now: Date;
  baseRetryDelayMs: number;
}): Promise<AppointmentReconciliationProcessResult> {
  const nextRetryAt = new Date(
    input.now.getTime() + retryDelayMs(input.retryCount, input.baseRetryDelayMs),
  );
  await markAppointmentReconciliationPending({
    tenantId: input.tenantId,
    appointmentId: input.appointmentId,
    status: input.status,
    reason: input.reason,
    nextRetryAt,
    now: input.now,
  });

  return {
    appointmentId: input.appointmentId,
    status: 'retry_scheduled',
    reason: input.reason,
  };
}

async function failReconciliation(input: {
  tenantId: string;
  appointmentId: string;
  reason: string;
  now: Date;
}): Promise<AppointmentReconciliationProcessResult> {
  await markAppointmentReconciliationFailed({
    tenantId: input.tenantId,
    appointmentId: input.appointmentId,
    finalError: input.reason,
    now: input.now,
  });

  return {
    appointmentId: input.appointmentId,
    status: 'failed',
    reason: input.reason,
  };
}

export async function processAppointmentReconciliationCandidate(
  input: ProcessAppointmentReconciliationInput,
): Promise<AppointmentReconciliationProcessResult> {
  assertTenantAccess(input.tenantId);
  if (input.appointment.tenantId !== input.tenantId) {
    throw new ValidationError('Appointment reconciliation candidate tenant mismatch');
  }

  const now = input.now ?? new Date();
  const maxRetries = input.maxRetries ?? 5;
  const baseRetryDelayMs = input.baseRetryDelayMs ?? 5 * 60_000;
  const reconciliation = reconciliationMetadata(input.appointment);
  const status = reconciliationStatusFrom(reconciliation);
  if (!status) {
    return await failReconciliation({
      tenantId: input.tenantId,
      appointmentId: input.appointment.id,
      reason: 'Unsupported or missing reconciliation status',
      now,
    });
  }

  const currentRetryCount = retryCountFrom(reconciliation);
  if (currentRetryCount >= maxRetries) {
    return await failReconciliation({
      tenantId: input.tenantId,
      appointmentId: input.appointment.id,
      reason: `Appointment reconciliation exceeded max retries (${maxRetries})`,
      now,
    });
  }

  await markAppointmentReconciliationRetrying({
    tenantId: input.tenantId,
    appointmentId: input.appointment.id,
    lastError: 'Processing appointment reconciliation candidate',
    retryDelayMs: 0,
    now,
  });
  const retryCountAfterStart = currentRetryCount + 1;

  try {
    if (status === 'external_created_local_confirm_failed') {
      const externalCalendarEventId = externalCalendarEventIdFrom(input.appointment);
      if (!externalCalendarEventId) {
        return await failReconciliation({
          tenantId: input.tenantId,
          appointmentId: input.appointment.id,
          reason: 'Missing external calendar event id for confirmation repair',
          now,
        });
      }

      if (
        input.appointment.status === 'confirmed' &&
        input.appointment.externalCalendarEventId === externalCalendarEventId
      ) {
        await markAppointmentReconciliationResolved({
          tenantId: input.tenantId,
          appointmentId: input.appointment.id,
          now,
        });
        return { appointmentId: input.appointment.id, status: 'resolved' };
      }

      if (input.appointment.status !== 'scheduled') {
        return await failReconciliation({
          tenantId: input.tenantId,
          appointmentId: input.appointment.id,
          reason: `Cannot confirm appointment from status ${input.appointment.status}`,
          now,
        });
      }

      await attachExternalCalendarEvent({
        tenantId: input.tenantId,
        appointmentId: input.appointment.id,
        externalCalendarEventId,
      });
      await markAppointmentReconciliationResolved({
        tenantId: input.tenantId,
        appointmentId: input.appointment.id,
        now,
      });
      return { appointmentId: input.appointment.id, status: 'resolved' };
    }

    if (status === 'local_cancelled_external_cancel_failed') {
      const externalCalendarEventId = externalCalendarEventIdFrom(input.appointment);
      if (!externalCalendarEventId) {
        await markAppointmentReconciliationResolved({
          tenantId: input.tenantId,
          appointmentId: input.appointment.id,
          now,
        });
        return { appointmentId: input.appointment.id, status: 'resolved' };
      }

      await cancelGoogleCalendarAppointment({
        tenantId: input.tenantId,
        eventId: externalCalendarEventId,
      });
      await markAppointmentReconciliationResolved({
        tenantId: input.tenantId,
        appointmentId: input.appointment.id,
        now,
      });
      return { appointmentId: input.appointment.id, status: 'resolved' };
    }

    const externalCalendarEventId = externalCalendarEventIdFrom(input.appointment);
    if (!externalCalendarEventId) {
      return await failReconciliation({
        tenantId: input.tenantId,
        appointmentId: input.appointment.id,
        reason: 'Missing external calendar event id for reschedule repair',
        now,
      });
    }

    await rescheduleGoogleCalendarAppointment({
      tenantId: input.tenantId,
      eventId: externalCalendarEventId,
      appAppointmentId: input.appointment.id,
      timezone: input.appointment.timezone,
      slot: {
        startIso: input.appointment.startAt.toISOString(),
        endIso: input.appointment.endAt.toISOString(),
      },
    });
    await markAppointmentReconciliationResolved({
      tenantId: input.tenantId,
      appointmentId: input.appointment.id,
      now,
    });
    return { appointmentId: input.appointment.id, status: 'resolved' };
  } catch (error) {
    return await scheduleRetry({
      tenantId: input.tenantId,
      appointmentId: input.appointment.id,
      status,
      retryCount: retryCountAfterStart,
      reason: error instanceof Error ? error.message : String(error),
      now,
      baseRetryDelayMs,
    });
  }
}

export async function processDueAppointmentReconciliations(
  input: ProcessDueAppointmentReconciliationsInput,
): Promise<AppointmentReconciliationProcessResult[]> {
  assertTenantAccess(input.tenantId);
  const candidates = await findReconciliationRetryCandidates({
    tenantId: input.tenantId,
    now: input.now,
    limit: input.limit,
  });
  const results: AppointmentReconciliationProcessResult[] = [];

  for (const appointment of candidates) {
    try {
      results.push(
        await processAppointmentReconciliationCandidate({
          tenantId: input.tenantId,
          appointment,
          now: input.now,
          maxRetries: input.maxRetries,
          baseRetryDelayMs: input.baseRetryDelayMs,
        }),
      );
    } catch (error) {
      results.push({
        appointmentId: appointment.id,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
