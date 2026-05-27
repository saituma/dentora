import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { integrations, pmsWebhookEvents } from '../../../../db/schema.js';
import { assertTenantAccess } from '../../../../db/tenant-context.js';
import { generateId } from '../../../../lib/crypto.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../lib/errors.js';
import { createExternalEntityMapping } from '../../services/external-entity-mapping.service.js';
import { decryptDentallyWebhookSecret, dentallyConfigFromIntegration } from './dentally.auth.js';
import { DentallyWebhookSignatureError } from './dentally.errors.js';

const SUPPORTED_DENTALLY_WEBHOOK_EVENTS = [
  'appointment.created',
  'appointment.updated',
  'appointment.deleted',
  'patient.created',
  'patient.updated',
  'patient.deleted',
] as const;

export type DentallyWebhookEventType = (typeof SUPPORTED_DENTALLY_WEBHOOK_EVENTS)[number];

export interface DentallyWebhookInput {
  tenantId: string;
  integrationId: string;
  payload: unknown;
  rawBody: string;
  headers?: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  signature?: string | null;
  timestamp?: string | null;
  receivedAt?: Date;
}

export interface DentallyWebhookResult {
  id: string;
  eventType: DentallyWebhookEventType;
  duplicate: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringFrom(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function supportedEventType(value: string): DentallyWebhookEventType | null {
  return SUPPORTED_DENTALLY_WEBHOOK_EVENTS.find((eventType) => eventType === value) ?? null;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new ValidationError('Dentally webhook payload must be an object');
  }
  return payload;
}

function eventTypeFromPayload(payload: Record<string, unknown>): DentallyWebhookEventType {
  const eventType =
    stringFrom(payload.event_type) ?? stringFrom(payload.event) ?? stringFrom(payload.type);
  const supported = eventType ? supportedEventType(eventType) : null;
  if (!supported) {
    throw new ValidationError('Unsupported Dentally webhook event type');
  }
  return supported;
}

function nestedRecord(
  payload: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = payload[key];
  return isRecord(value) ? value : null;
}

function resourcePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return (
    nestedRecord(payload, 'data') ??
    nestedRecord(payload, 'appointment') ??
    nestedRecord(payload, 'patient') ??
    payload
  );
}

function externalEventIdFromPayload(
  eventType: DentallyWebhookEventType,
  payload: Record<string, unknown>,
  payloadHash: string,
): string {
  return (
    stringFrom(payload.id) ??
    stringFrom(payload.event_id) ??
    stringFrom(payload.webhook_event_id) ??
    `${eventType}:${payloadHash}`
  );
}

function externalResourceId(payload: Record<string, unknown>): string | null {
  return (
    stringFrom(payload.id) ?? stringFrom(payload.appointment_id) ?? stringFrom(payload.patient_id)
  );
}

function metadata(payload: Record<string, unknown>): Record<string, unknown> {
  return nestedRecord(payload, 'metadata') ?? nestedRecord(payload, 'extended_properties') ?? {};
}

function localEntityId(
  payload: Record<string, unknown>,
  entity: 'appointment' | 'patient',
): string | null {
  const direct =
    entity === 'appointment'
      ? (stringFrom(payload.localAppointmentId) ??
        stringFrom(payload.appAppointmentId) ??
        stringFrom(payload.dentalflowAppointmentId))
      : (stringFrom(payload.localPatientId) ?? stringFrom(payload.dentalflowPatientId));
  if (direct) return direct;
  const meta = metadata(payload);
  return entity === 'appointment'
    ? (stringFrom(meta.localAppointmentId) ??
        stringFrom(meta.appAppointmentId) ??
        stringFrom(meta.dentalflowAppointmentId))
    : (stringFrom(meta.localPatientId) ?? stringFrom(meta.dentalflowPatientId));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeSignature(value: string): string {
  return value.startsWith('sha256=') ? value.slice('sha256='.length) : value;
}

function headerValue(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined> | undefined,
  headerName: string,
): string | null {
  if (!headers) return null;
  const value = headers[headerName.toLowerCase()] ?? headers[headerName];
  if (Array.isArray(value)) {
    return stringFrom(value[0]);
  }
  return stringFrom(value);
}

function validateTimestamp(input: {
  timestamp: string | null | undefined;
  receivedAt: Date;
  replayWindowSeconds: number;
}): void {
  const { timestamp, receivedAt, replayWindowSeconds } = input;
  if (!timestamp) {
    throw new DentallyWebhookSignatureError('Missing Dentally webhook timestamp');
  }
  const timestampMs =
    Number(timestamp) > 10_000_000_000 ? Number(timestamp) : Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) {
    throw new DentallyWebhookSignatureError('Invalid Dentally webhook timestamp');
  }
  const ageMs = Math.abs(receivedAt.getTime() - timestampMs);
  if (ageMs > replayWindowSeconds * 1000) {
    throw new DentallyWebhookSignatureError(
      'Dentally webhook timestamp is outside the replay window',
    );
  }
}

export function validateDentallyWebhookSignature(input: {
  secret: string | null;
  rawBody: string;
  signature?: string | null;
  timestamp?: string | null;
  receivedAt: Date;
  replayWindowSeconds?: number;
}): void {
  if (!input.secret) {
    throw new DentallyWebhookSignatureError('Dentally webhook secret is not configured');
  }
  validateTimestamp({
    timestamp: input.timestamp,
    receivedAt: input.receivedAt,
    replayWindowSeconds: input.replayWindowSeconds ?? 300,
  });
  if (!input.signature) {
    throw new DentallyWebhookSignatureError('Missing Dentally webhook signature');
  }

  const expected = createHmac('sha256', input.secret).update(input.rawBody).digest('hex');
  const provided = normalizeSignature(input.signature);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(provided, 'hex');
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new DentallyWebhookSignatureError();
  }
}

async function createMappingIfPossible(input: {
  tenantId: string;
  integrationId: string;
  eventType: DentallyWebhookEventType;
  resource: Record<string, unknown>;
}): Promise<void> {
  const entityType = input.eventType.startsWith('appointment.') ? 'appointment' : 'patient';
  const externalId = externalResourceId(input.resource);
  const localId = localEntityId(input.resource, entityType);
  if (!externalId || !localId) return;

  await createExternalEntityMapping({
    tenantId: input.tenantId,
    localEntityType: entityType,
    localEntityId: localId,
    externalProvider: 'dentally',
    externalEntityType: entityType,
    externalEntityId: externalId,
    integrationId: input.integrationId,
    metadata: { source: 'dentally.webhook', eventType: input.eventType },
  });
}

export async function handleDentallyWebhookEvent(
  input: DentallyWebhookInput,
): Promise<DentallyWebhookResult> {
  assertTenantAccess(input.tenantId);
  const receivedAt = input.receivedAt ?? new Date();
  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, input.tenantId),
        eq(integrations.id, input.integrationId),
        eq(integrations.provider, 'dentally'),
      ),
    )
    .limit(1);

  if (!integration) {
    throw new NotFoundError('Dentally integration', input.integrationId);
  }

  const config = dentallyConfigFromIntegration(integration);
  const signature =
    headerValue(input.headers, config.signatureHeader) ?? stringFrom(input.signature);
  const timestamp =
    headerValue(input.headers, config.timestampHeader) ?? stringFrom(input.timestamp);

  validateDentallyWebhookSignature({
    secret: decryptDentallyWebhookSecret(integration),
    rawBody: input.rawBody,
    signature,
    timestamp,
    receivedAt,
    replayWindowSeconds: config.replayWindowSeconds,
  });

  const payload = payloadRecord(input.payload);
  const eventType = eventTypeFromPayload(payload);
  const payloadHash = sha256(input.rawBody);
  const externalEventId = externalEventIdFromPayload(eventType, payload, payloadHash);
  const [existing] = await db
    .select()
    .from(pmsWebhookEvents)
    .where(
      and(
        eq(pmsWebhookEvents.tenantId, input.tenantId),
        eq(pmsWebhookEvents.provider, 'dentally'),
        eq(pmsWebhookEvents.integrationId, input.integrationId),
        eq(pmsWebhookEvents.externalEventId, externalEventId),
      ),
    )
    .limit(1);

  if (existing) {
    throw new ConflictError('Duplicate Dentally webhook event', {
      eventId: existing.id,
      externalEventId,
    });
  }

  const [created] = await db
    .insert(pmsWebhookEvents)
    .values({
      id: generateId(),
      tenantId: input.tenantId,
      provider: 'dentally',
      integrationId: input.integrationId,
      externalEventId,
      eventType,
      payloadHash,
      payload,
      status: 'received',
      receivedAt,
    })
    .returning();

  if (!created) {
    throw new ValidationError('Failed to store Dentally webhook event');
  }

  await createMappingIfPossible({
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    eventType,
    resource: resourcePayload(payload),
  });

  await db
    .update(pmsWebhookEvents)
    .set({ status: 'processed', processedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pmsWebhookEvents.tenantId, input.tenantId), eq(pmsWebhookEvents.id, created.id)));

  return { id: created.id, eventType, duplicate: false };
}
