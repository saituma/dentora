import { and, desc, eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { staffReviewItems } from '../../db/schema.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { generateId } from '../../lib/crypto.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';

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

  const [created] = await db
    .insert(staffReviewItems)
    .values({
      id: generateId(),
      tenantId: input.tenantId,
      type: input.type,
      severity: input.severity ?? 'medium',
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
    })
    .returning();
  return created;
}

export async function listStaffReviewItems(input: {
  tenantId: string;
  status?: StaffReviewStatus;
  limit?: number;
}): Promise<StaffReviewItem[]> {
  assertTenantAccess(input.tenantId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const predicates = [eq(staffReviewItems.tenantId, input.tenantId)];
  if (input.status) predicates.push(eq(staffReviewItems.status, input.status));
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
  } catch {
    // Review queue writes should never break the caller-facing workflow.
  }
}
