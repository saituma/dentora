import { and, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { staffReviewItems } from '../../db/schema.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { generateId } from '../../lib/crypto.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { staffReviewQueueWriteFailuresTotal } from '../../lib/metrics.js';

export type StaffReviewItem = InferSelectModel<typeof staffReviewItems>;
export type StaffReviewItemType = StaffReviewItem['type'];
export type StaffReviewSeverity = StaffReviewItem['severity'];
export type StaffReviewStatus = StaffReviewItem['status'];
export type StaffReviewSource = StaffReviewItem['source'];

export type SafeReviewMetadata =
  | string
  | number
  | boolean
  | null
  | SafeReviewMetadata[]
  | { [key: string]: SafeReviewMetadata };

export interface CreateStaffReviewItemInput {
  tenantId: string;
  type: StaffReviewItemType;
  severity?: StaffReviewSeverity;
  source: StaffReviewSource;
  relatedAppointmentId?: string | null;
  relatedCallSessionId?: string | null;
  relatedPatientId?: string | null;
  relatedExternalEventRef?: string | null;
  reasonCode: string;
  message: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
  slaDueAt?: Date | null;
}

export interface StaffReviewListInput {
  tenantId: string;
  status?: StaffReviewStatus;
  severity?: StaffReviewSeverity;
  type?: StaffReviewItemType;
  source?: StaffReviewSource;
  limit?: number;
}

export interface SafeStaffReviewItemResponse {
  id: string;
  tenantId: string;
  type: StaffReviewItemType;
  severity: StaffReviewSeverity;
  status: StaffReviewStatus;
  source: StaffReviewSource;
  reasonCode: string;
  message: string;
  relatedAppointmentId: string | null;
  relatedCallSessionId: string | null;
  relatedExternalEventRef: string | null;
  safeMetadata: SafeReviewMetadata;
  createdAt: Date;
  updatedAt: Date;
  slaDueAt: Date | null;
  overdue: boolean;
}

export interface StaffReviewDigestItemRef {
  id: string;
  type: StaffReviewItemType;
  severity: StaffReviewSeverity;
  status: StaffReviewStatus;
  source: StaffReviewSource;
  reasonCode: string;
  createdAt: Date;
  slaDueAt: Date | null;
  overdue: boolean;
}

export interface StaffReviewDailyDigest {
  checkedAt: string;
  totalUnresolved: number;
  overdueCount: number;
  highCriticalOpenCount: number;
  countsBySeverity: Record<StaffReviewSeverity, number>;
  countsByStatus: Record<StaffReviewStatus, number>;
  countsByType: Partial<Record<StaffReviewItemType, number>>;
  countsBySource: Partial<Record<StaffReviewSource, number>>;
  itemRefs: StaffReviewDigestItemRef[];
}

const SENSITIVE_METADATA_KEYS = new Set([
  'name',
  'fullname',
  'firstname',
  'lastname',
  'patientname',
  'phone',
  'phonenumber',
  'callernumber',
  'dob',
  'dateofbirth',
  'notes',
  'reason',
  'reasonforvisit',
  'transcript',
  'fulltranscript',
  'summary',
  'description',
  'text',
  'content',
  'token',
  'apikey',
  'apikeys',
  'authorization',
  'secret',
  'refreshtoken',
  'accesstoken',
]);
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const DOB_PATTERN =
  /\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2}\b/g;
const ALLOWED_STATUS_TRANSITIONS: Record<StaffReviewStatus, StaffReviewStatus[]> = {
  open: ['in_review', 'resolved', 'ignored'],
  in_review: ['open', 'resolved', 'ignored'],
  resolved: [],
  ignored: ['open'],
};

const SLA_HOURS_BY_SEVERITY: Record<StaffReviewSeverity, number> = {
  critical: 4,
  high: 24,
  medium: 72,
  low: 168,
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sanitizeString(value: string): string {
  return value.replace(PHONE_PATTERN, '[REDACTED]').replace(DOB_PATTERN, '[REDACTED]');
}

export function sanitizeReviewMetadata(value: unknown): SafeReviewMetadata {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((entry) => sanitizeReviewMetadata(entry));
  if (typeof value !== 'object') return null;

  const safe: { [key: string]: SafeReviewMetadata } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_METADATA_KEYS.has(normalizeKey(key))) continue;
    safe[key] = sanitizeReviewMetadata(entry);
  }
  return safe;
}

function sanitizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  return trimmed ? sanitizeString(trimmed).slice(0, 500) : null;
}

function computeSlaDueAt(severity: StaffReviewSeverity, createdAt = new Date()): Date {
  return new Date(createdAt.getTime() + SLA_HOURS_BY_SEVERITY[severity] * 60 * 60 * 1000);
}

function isUnresolvedStatus(status: StaffReviewStatus): boolean {
  return status === 'open' || status === 'in_review';
}

function isOverdue(item: StaffReviewItem, now = new Date()): boolean {
  return isUnresolvedStatus(item.status) && Boolean(item.slaDueAt && item.slaDueAt <= now);
}

export function toSafeStaffReviewItemResponse(
  item: StaffReviewItem,
  now = new Date(),
): SafeStaffReviewItemResponse {
  return {
    id: item.id,
    tenantId: item.tenantId,
    type: item.type,
    severity: item.severity,
    status: item.status,
    source: item.source,
    reasonCode: item.reasonCode,
    message: sanitizeString(item.message).slice(0, 500),
    relatedAppointmentId: item.relatedAppointmentId,
    relatedCallSessionId: item.relatedCallSessionId,
    relatedExternalEventRef: item.relatedExternalEventRef
      ? sanitizeString(item.relatedExternalEventRef).slice(0, 200)
      : null,
    safeMetadata: sanitizeReviewMetadata(item.metadata ?? {}),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    slaDueAt: item.slaDueAt,
    overdue: isOverdue(item, now),
  };
}

function toDigestItemRef(item: StaffReviewItem, now: Date): StaffReviewDigestItemRef {
  return {
    id: item.id,
    type: item.type,
    severity: item.severity,
    status: item.status,
    source: item.source,
    reasonCode: item.reasonCode,
    createdAt: item.createdAt,
    slaDueAt: item.slaDueAt,
    overdue: isOverdue(item, now),
  };
}

function incrementCount<K extends string>(counts: Partial<Record<K, number>>, key: K): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function defaultDedupeKey(input: CreateStaffReviewItemInput): string {
  return [
    input.type,
    input.source,
    input.relatedAppointmentId ?? 'no-appointment',
    input.relatedCallSessionId ?? 'no-call',
    input.relatedExternalEventRef ?? 'no-event',
    input.reasonCode,
  ].join(':');
}

async function findOpenReviewItemByDedupeKey(
  tenantId: string,
  dedupeKey: string,
): Promise<StaffReviewItem | null> {
  const [existing] = await db
    .select()
    .from(staffReviewItems)
    .where(
      and(
        eq(staffReviewItems.tenantId, tenantId),
        eq(staffReviewItems.dedupeKey, dedupeKey),
        eq(staffReviewItems.status, 'open'),
      ),
    )
    .limit(1);
  return existing ?? null;
}

export async function createStaffReviewItem(
  input: CreateStaffReviewItemInput,
): Promise<StaffReviewItem> {
  assertTenantAccess(input.tenantId);
  const dedupeKey = input.dedupeKey?.trim() || defaultDedupeKey(input);
  const existing = await findOpenReviewItemByDedupeKey(input.tenantId, dedupeKey);
  if (existing) return existing;
  const severity = input.severity ?? 'medium';

  const [created] = await db
    .insert(staffReviewItems)
    .values({
      id: generateId(),
      tenantId: input.tenantId,
      type: input.type,
      severity,
      status: 'open',
      source: input.source,
      relatedAppointmentId: input.relatedAppointmentId ?? null,
      relatedCallSessionId: input.relatedCallSessionId ?? null,
      relatedPatientId: input.relatedPatientId ?? null,
      relatedExternalEventRef: input.relatedExternalEventRef ?? null,
      reasonCode: input.reasonCode,
      message: sanitizeString(input.message).slice(0, 500),
      metadata: sanitizeReviewMetadata(input.metadata ?? {}),
      dedupeKey,
      assignedToUserId: null,
      resolvedByUserId: null,
      resolvedAt: null,
      resolutionNote: null,
      slaDueAt: input.slaDueAt ?? computeSlaDueAt(severity),
      lastNotifiedAt: null,
    })
    .returning();
  return created;
}

export async function listStaffReviewItems(
  input: StaffReviewListInput,
): Promise<StaffReviewItem[]> {
  assertTenantAccess(input.tenantId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const predicates = [eq(staffReviewItems.tenantId, input.tenantId)];
  if (input.status) predicates.push(eq(staffReviewItems.status, input.status));
  if (input.severity) predicates.push(eq(staffReviewItems.severity, input.severity));
  if (input.type) predicates.push(eq(staffReviewItems.type, input.type));
  if (input.source) predicates.push(eq(staffReviewItems.source, input.source));
  return await db
    .select()
    .from(staffReviewItems)
    .where(and(...predicates))
    .orderBy(desc(staffReviewItems.createdAt))
    .limit(limit);
}

export async function getStaffReviewItem(input: {
  tenantId: string;
  id: string;
}): Promise<StaffReviewItem> {
  assertTenantAccess(input.tenantId);
  const [item] = await db
    .select()
    .from(staffReviewItems)
    .where(and(eq(staffReviewItems.tenantId, input.tenantId), eq(staffReviewItems.id, input.id)))
    .limit(1);
  if (!item) throw new NotFoundError('Staff review item not found');
  return item;
}

export async function updateStaffReviewItemStatus(input: {
  tenantId: string;
  id: string;
  status: StaffReviewStatus;
  resolvedByUserId?: string | null;
  resolutionNote?: string | null;
}): Promise<StaffReviewItem> {
  const current = await getStaffReviewItem({ tenantId: input.tenantId, id: input.id });
  if (current.status === input.status) return current;
  if (!ALLOWED_STATUS_TRANSITIONS[current.status].includes(input.status)) {
    throw new ValidationError(
      `Cannot transition review item from ${current.status} to ${input.status}`,
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(staffReviewItems)
    .set({
      status: input.status,
      resolvedByUserId:
        input.status === 'resolved' || input.status === 'ignored'
          ? (input.resolvedByUserId ?? null)
          : current.resolvedByUserId,
      resolvedAt: input.status === 'resolved' || input.status === 'ignored' ? now : null,
      resolutionNote: sanitizeNote(input.resolutionNote),
      updatedAt: now,
    })
    .where(and(eq(staffReviewItems.tenantId, input.tenantId), eq(staffReviewItems.id, input.id)))
    .returning();
  if (!updated) throw new NotFoundError('Staff review item not found');
  return updated;
}

export async function listHighCriticalOpenItemsNeedingNotification(input: {
  tenantId: string;
  now?: Date;
  limit?: number;
}): Promise<StaffReviewItem[]> {
  assertTenantAccess(input.tenantId);
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  return await db
    .select()
    .from(staffReviewItems)
    .where(
      and(
        eq(staffReviewItems.tenantId, input.tenantId),
        eq(staffReviewItems.status, 'open'),
        inArray(staffReviewItems.severity, ['high', 'critical']),
        or(isNull(staffReviewItems.lastNotifiedAt), lte(staffReviewItems.slaDueAt, now)),
      ),
    )
    .orderBy(desc(staffReviewItems.createdAt))
    .limit(limit);
}

export async function getDailyStaffReviewDigest(input: {
  tenantId: string;
  now?: Date;
  limit?: number;
}): Promise<StaffReviewDailyDigest> {
  assertTenantAccess(input.tenantId);
  const now = input.now ?? new Date();
  const items = await listStaffReviewItems({
    tenantId: input.tenantId,
    limit: input.limit ?? 200,
  });
  const unresolved = items.filter((item) => isUnresolvedStatus(item.status));
  const countsBySeverity: Record<StaffReviewSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const countsByStatus: Record<StaffReviewStatus, number> = {
    open: 0,
    in_review: 0,
    resolved: 0,
    ignored: 0,
  };
  const countsByType: Partial<Record<StaffReviewItemType, number>> = {};
  const countsBySource: Partial<Record<StaffReviewSource, number>> = {};

  for (const item of items) {
    countsBySeverity[item.severity] += 1;
    countsByStatus[item.status] += 1;
    incrementCount(countsByType, item.type);
    incrementCount(countsBySource, item.source);
  }

  return {
    checkedAt: now.toISOString(),
    totalUnresolved: unresolved.length,
    overdueCount: unresolved.filter((item) => isOverdue(item, now)).length,
    highCriticalOpenCount: unresolved.filter(
      (item) =>
        item.status === 'open' && (item.severity === 'high' || item.severity === 'critical'),
    ).length,
    countsBySeverity,
    countsByStatus,
    countsByType,
    countsBySource,
    itemRefs: unresolved.map((item) => toDigestItemRef(item, now)),
  };
}

export async function assignStaffReviewItem(input: {
  tenantId: string;
  id: string;
  assignedToUserId: string | null;
}): Promise<StaffReviewItem> {
  await getStaffReviewItem({ tenantId: input.tenantId, id: input.id });
  const [updated] = await db
    .update(staffReviewItems)
    .set({ assignedToUserId: input.assignedToUserId, updatedAt: new Date() })
    .where(and(eq(staffReviewItems.tenantId, input.tenantId), eq(staffReviewItems.id, input.id)))
    .returning();
  if (!updated) throw new NotFoundError('Staff review item not found');
  return updated;
}

export async function createStaffReviewItemSafely(
  input: CreateStaffReviewItemInput,
): Promise<void> {
  try {
    await createStaffReviewItem(input);
  } catch (error) {
    staffReviewQueueWriteFailuresTotal
      .labels(input.tenantId, input.type, input.source, input.reasonCode)
      .inc();
    logger.error(
      {
        tenantId: input.tenantId,
        type: input.type,
        severity: input.severity ?? 'medium',
        source: input.source,
        reasonCode: input.reasonCode,
        relatedAppointmentId: input.relatedAppointmentId ?? null,
        relatedCallSessionId: input.relatedCallSessionId ?? null,
        relatedExternalEventRef: input.relatedExternalEventRef
          ? sanitizeString(input.relatedExternalEventRef).slice(0, 200)
          : null,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
      'Staff review queue write failed',
    );
  }
}

export const NOTIFICATION_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function listItemsNeedingAlerts(input: {
  tenantId: string;
  now?: Date;
  cooldownMs?: number;
  limit?: number;
}): Promise<StaffReviewItem[]> {
  assertTenantAccess(input.tenantId);
  const now = input.now ?? new Date();
  const cooldownMs = input.cooldownMs ?? NOTIFICATION_COOLDOWN_MS;
  const cooldownCutoff = new Date(now.getTime() - cooldownMs);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  return await db
    .select()
    .from(staffReviewItems)
    .where(
      and(
        eq(staffReviewItems.tenantId, input.tenantId),
        or(
          // high/critical open items
          and(
            eq(staffReviewItems.status, 'open'),
            inArray(staffReviewItems.severity, ['high', 'critical']),
          ),
          // overdue items of any severity (unresolved, past SLA)
          and(
            inArray(staffReviewItems.status, ['open', 'in_review']),
            lte(staffReviewItems.slaDueAt, now),
          ),
        ),
        // cooldown: not notified or last notified before cooldown window
        or(
          isNull(staffReviewItems.lastNotifiedAt),
          lte(staffReviewItems.lastNotifiedAt, cooldownCutoff),
        ),
      ),
    )
    .orderBy(desc(staffReviewItems.createdAt))
    .limit(limit);
}

export async function markItemNotified(input: {
  tenantId: string;
  id: string;
  notifiedAt?: Date;
}): Promise<void> {
  assertTenantAccess(input.tenantId);
  await db
    .update(staffReviewItems)
    .set({ lastNotifiedAt: input.notifiedAt ?? new Date(), updatedAt: new Date() })
    .where(and(eq(staffReviewItems.tenantId, input.tenantId), eq(staffReviewItems.id, input.id)));
}
