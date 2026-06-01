import { and, count, eq, gte, isNull, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { mediaStreamHealthEvents, operationalHealth } from '../../db/schema.js';

export type OperationalHealthComponent = 'appointment_maintenance';
export type OperationalHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type MediaStreamHealthEventType =
  | 'start_timeout'
  | 'invalid_start'
  | 'pending_limit_exceeded'
  | 'abnormal_disconnect';

export interface AppointmentMaintenanceHealthMetadata {
  tenantsProcessed: number;
  tenantsFailed: number;
  holdsExpired: number;
  reconciliationCandidatesFound: number;
  reconciliationCandidatesProcessed: number;
  durationMs: number;
}

export interface OperationalHealthSnapshot {
  component: OperationalHealthComponent;
  status: OperationalHealthStatus;
  fresh: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
  lastErrorName: string | null;
  metadata: Record<string, number | string | boolean | null>;
}

export const APPOINTMENT_MAINTENANCE_COMPONENT: OperationalHealthComponent =
  'appointment_maintenance';

const DEFAULT_WORKER_HEALTH_MAX_AGE_MS = 30 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function safeErrorCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  return typeof error.code === 'string' ? error.code.slice(0, 80) : null;
}

function safeMetadata(
  metadata: Record<string, number | string | boolean | null>,
): Record<string, number | string | boolean | null> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.slice(0, 120) : value,
    ]),
  );
}

function safeMediaStreamMetadata(
  metadata: Record<string, number | string | boolean | null>,
): Record<string, number | boolean | null> {
  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, number | boolean | null] => {
      const value = entry[1];
      return typeof value === 'number' || typeof value === 'boolean' || value === null;
    }),
  );
}

async function upsertOperationalHealth(input: {
  component: OperationalHealthComponent;
  status: OperationalHealthStatus;
  now: Date;
  lastStartedAt?: Date | null;
  lastCompletedAt?: Date | null;
  lastSuccessAt?: Date | null;
  lastFailureAt?: Date | null;
  lastErrorCode?: string | null;
  lastErrorName?: string | null;
  metadata?: Record<string, number | string | boolean | null>;
}): Promise<void> {
  const row = {
    component: input.component,
    status: input.status,
    lastStartedAt: input.lastStartedAt,
    lastCompletedAt: input.lastCompletedAt,
    lastSuccessAt: input.lastSuccessAt,
    lastFailureAt: input.lastFailureAt,
    lastErrorCode: input.lastErrorCode,
    lastErrorName: input.lastErrorName,
    metadata: safeMetadata(input.metadata ?? {}),
    updatedAt: input.now,
  };

  await db.insert(operationalHealth).values(row).onConflictDoUpdate({
    target: operationalHealth.component,
    set: row,
  });
}

export async function recordOperationalHealthStarted(input: {
  component: OperationalHealthComponent;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await upsertOperationalHealth({
    component: input.component,
    status: 'degraded',
    now,
    lastStartedAt: now,
    metadata: { state: 'started' },
  });
}

export async function recordOperationalHealthSuccess(input: {
  component: OperationalHealthComponent;
  metadata: Record<string, number | string | boolean | null>;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await upsertOperationalHealth({
    component: input.component,
    status: 'healthy',
    now,
    lastCompletedAt: now,
    lastSuccessAt: now,
    lastErrorCode: null,
    lastErrorName: null,
    metadata: input.metadata,
  });
}

export async function recordOperationalHealthFailure(input: {
  component: OperationalHealthComponent;
  error: unknown;
  metadata?: Record<string, number | string | boolean | null>;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await upsertOperationalHealth({
    component: input.component,
    status: 'unhealthy',
    now,
    lastCompletedAt: now,
    lastFailureAt: now,
    lastErrorCode: safeErrorCode(input.error),
    lastErrorName: safeErrorName(input.error),
    metadata: input.metadata,
  });
}

export async function getOperationalHealthSnapshot(input: {
  component: OperationalHealthComponent;
  now?: Date;
  maxAgeMs?: number;
}): Promise<OperationalHealthSnapshot> {
  const now = input.now ?? new Date();
  const [row] = await db
    .select()
    .from(operationalHealth)
    .where(eq(operationalHealth.component, input.component))
    .limit(1);

  if (!row) {
    return {
      component: input.component,
      status: 'unknown',
      fresh: false,
      lastStartedAt: null,
      lastCompletedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorCode: null,
      lastErrorName: null,
      metadata: {},
    };
  }

  const latestHeartbeat = row.lastSuccessAt ?? row.lastStartedAt ?? row.updatedAt;
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_WORKER_HEALTH_MAX_AGE_MS;
  const fresh = now.getTime() - latestHeartbeat.getTime() <= maxAgeMs;

  return {
    component: input.component,
    status: row.status as OperationalHealthStatus,
    fresh,
    lastStartedAt: row.lastStartedAt?.toISOString() ?? null,
    lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    lastErrorName: row.lastErrorName,
    metadata: isRecord(row.metadata)
      ? (row.metadata as Record<string, number | string | boolean | null>)
      : {},
  };
}

export async function recordMediaStreamHealthEvent(input: {
  tenantId?: string | null;
  eventType: MediaStreamHealthEventType;
  reasonCode: string;
  occurredAt?: Date;
  metadata?: Record<string, number | string | boolean | null>;
}): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date();
  await db.insert(mediaStreamHealthEvents).values({
    tenantId: input.tenantId ?? null,
    eventType: input.eventType,
    reasonCode: input.reasonCode,
    occurredAt,
    count: 1,
    metadata: safeMediaStreamMetadata(input.metadata ?? {}),
  });
}

export async function countRecentMediaStreamHealthEvents(input: {
  tenantId: string;
  since: Date;
}): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(mediaStreamHealthEvents)
    .where(
      and(
        gte(mediaStreamHealthEvents.occurredAt, input.since),
        or(
          eq(mediaStreamHealthEvents.tenantId, input.tenantId),
          isNull(mediaStreamHealthEvents.tenantId),
        ),
      ),
    );

  return row?.value ?? 0;
}
