import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
const mockDecryptDentallyWebhookSecret = vi.hoisted(() => vi.fn());
const mockCreateExternalEntityMapping = vi.hoisted(() => vi.fn());

vi.mock('../../../../db/index.js', () => ({ db: mockDb }));
vi.mock('../../../../lib/crypto.js', () => ({ generateId: () => 'webhook-event-a' }));
vi.mock('./dentally.auth.js', () => ({
  decryptDentallyWebhookSecret: mockDecryptDentallyWebhookSecret,
  dentallyConfigFromIntegration: () => ({
    baseUrl: 'https://api.sandbox.dentally.co',
    appointmentPath: '/appointments',
    patientPath: '/patients',
    clinicianPath: '/practitioners',
    roomPath: '/rooms',
    webhookPath: '/webhooks',
    authPath: '/user',
    signatureHeader: 'x-dentally-signature',
    timestampHeader: 'x-dentally-timestamp',
    replayWindowSeconds: 300,
    timeoutMs: 15000,
    maxRetries: 2,
    practiceId: 'practice-a',
    practiceName: 'Practice A',
  }),
}));
vi.mock('../../services/external-entity-mapping.service.js', () => ({
  createExternalEntityMapping: mockCreateExternalEntityMapping,
}));

import { runWithTenantContext } from '../../../../db/tenant-context.js';
import { AuthorizationError, ConflictError } from '../../../../lib/errors.js';
import type { Integration } from '../../../integrations/integration.types.js';
import {
  handleDentallyWebhookEvent,
  validateDentallyWebhookSignature,
} from './dentally.webhook.js';
import { DentallyWebhookSignatureError } from './dentally.errors.js';

interface SelectChain<T> {
  from: Mock;
  where: Mock;
  limit: Mock;
  result: T[];
}

interface InsertChain<T> {
  values: Mock;
  returning: Mock;
  result: T[];
}

interface UpdateChain {
  set: Mock;
  where: Mock;
}

interface PmsWebhookEventRecord {
  id: string;
  tenantId: string;
  provider: 'dentally';
  integrationId: string;
  externalEventId: string;
  eventType: string;
  payloadHash: string;
  payload: unknown;
  status: string;
  receivedAt: Date;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const tenantId = 'tenant-a';
const integrationId = 'dentally-integration-a';
const receivedAt = new Date('2026-06-01T09:00:00.000Z');
const timestamp = String(Math.floor(receivedAt.getTime() / 1000));
const secret = 'webhook-secret-a';

function withTenant<T>(currentTenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId: currentTenantId, source: 'test' }, callback);
}

function sign(rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function webhookHeaders(rawBody: string): Record<string, string> {
  return {
    'x-dentally-signature': sign(rawBody),
    'x-dentally-timestamp': timestamp,
  };
}

function integrationFixture(): Integration {
  return {
    id: integrationId,
    tenantId,
    configVersion: 1,
    integrationType: 'scheduling',
    provider: 'dentally',
    status: 'active',
    config: {},
    credentials: { encryptedWebhookSecret: 'encrypted-webhook-secret' },
    capabilities: {},
    lastSyncAt: null,
    healthStatus: 'healthy',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };
}

function webhookEventFixture(
  input: {
    id?: string;
    externalEventId?: string;
    eventType?: string;
    payload?: unknown;
  } = {},
): PmsWebhookEventRecord {
  return {
    id: input.id ?? 'webhook-event-a',
    tenantId,
    provider: 'dentally',
    integrationId,
    externalEventId: input.externalEventId ?? 'external-webhook-event-a',
    eventType: input.eventType ?? 'appointment.created',
    payloadHash: 'payload-hash-a',
    payload: input.payload ?? {},
    status: 'received',
    receivedAt,
    processedAt: null,
    createdAt: receivedAt,
    updatedAt: receivedAt,
  };
}

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

function insertChain<T>(result: T[]): InsertChain<T> {
  const chain: InsertChain<T> = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
    result,
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function updateChain(): UpdateChain {
  const chain: UpdateChain = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue([]),
  };
  chain.set.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDecryptDentallyWebhookSecret.mockReturnValue(secret);
  mockCreateExternalEntityMapping.mockResolvedValue({ id: 'mapping-a' });
});

describe('Dentally webhooks', () => {
  it('validates Dentally webhook signatures and rejects mismatches', () => {
    const rawBody = JSON.stringify({ event_type: 'appointment.created' });

    expect(() =>
      validateDentallyWebhookSignature({
        secret,
        rawBody,
        signature: sign(rawBody),
        timestamp,
        receivedAt,
      }),
    ).not.toThrow();

    expect(() =>
      validateDentallyWebhookSignature({
        secret,
        rawBody,
        signature: 'sha256=bad',
        timestamp,
        receivedAt,
      }),
    ).toThrow(DentallyWebhookSignatureError);
  });

  it('stores an idempotent Dentally webhook event and writes external mappings', async () => {
    const payload = {
      event_type: 'appointment.created',
      event_id: 'dentally-webhook-event-a',
      data: {
        id: 'dentally-appointment-a',
        metadata: { localAppointmentId: 'appointment-a' },
      },
    };
    const rawBody = JSON.stringify(payload);
    const insert = insertChain<PmsWebhookEventRecord>([
      webhookEventFixture({ externalEventId: 'dentally-webhook-event-a', payload }),
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain<Integration>([integrationFixture()]))
      .mockReturnValueOnce(selectChain<PmsWebhookEventRecord>([]));
    mockDb.insert.mockReturnValueOnce(insert);
    mockDb.update.mockReturnValueOnce(updateChain());

    const result = await withTenant(tenantId, () =>
      handleDentallyWebhookEvent({
        tenantId,
        integrationId,
        payload,
        rawBody,
        headers: webhookHeaders(rawBody),
        receivedAt,
      }),
    );

    expect(result).toEqual({
      id: 'webhook-event-a',
      eventType: 'appointment.created',
      duplicate: false,
    });
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'webhook-event-a',
        tenantId,
        provider: 'dentally',
        integrationId,
        externalEventId: 'dentally-webhook-event-a',
        eventType: 'appointment.created',
        status: 'received',
      }),
    );
    expect(mockCreateExternalEntityMapping).toHaveBeenCalledWith({
      tenantId,
      localEntityType: 'appointment',
      localEntityId: 'appointment-a',
      externalProvider: 'dentally',
      externalEntityType: 'appointment',
      externalEntityId: 'dentally-appointment-a',
      integrationId,
      metadata: { source: 'dentally.webhook', eventType: 'appointment.created' },
    });
  });

  it('rejects duplicate Dentally webhook events before mutating mappings', async () => {
    const payload = {
      event_type: 'appointment.updated',
      event_id: 'duplicate-event-a',
      data: { id: 'dentally-appointment-a' },
    };
    const rawBody = JSON.stringify(payload);
    mockDb.select
      .mockReturnValueOnce(selectChain<Integration>([integrationFixture()]))
      .mockReturnValueOnce(
        selectChain<PmsWebhookEventRecord>([
          webhookEventFixture({ externalEventId: 'duplicate-event-a' }),
        ]),
      );

    await expect(
      withTenant(tenantId, () =>
        handleDentallyWebhookEvent({
          tenantId,
          integrationId,
          payload,
          rawBody,
          headers: webhookHeaders(rawBody),
          receivedAt,
        }),
      ),
    ).rejects.toThrow(ConflictError);

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockCreateExternalEntityMapping).not.toHaveBeenCalled();
  });

  it('enforces tenant isolation before loading webhook integration config', async () => {
    await expect(
      withTenant('tenant-b', () =>
        handleDentallyWebhookEvent({
          tenantId,
          integrationId,
          payload: { event_type: 'patient.updated' },
          rawBody: JSON.stringify({ event_type: 'patient.updated' }),
          receivedAt,
        }),
      ),
    ).rejects.toThrow(AuthorizationError);

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects stale timestamps and missing configured headers', async () => {
    const payload = {
      event_type: 'patient.updated',
      event_id: 'stale-event-a',
      data: { id: 'dentally-patient-a' },
    };
    const rawBody = JSON.stringify(payload);
    mockDb.select.mockReturnValueOnce(selectChain<Integration>([integrationFixture()]));

    await expect(
      withTenant(tenantId, () =>
        handleDentallyWebhookEvent({
          tenantId,
          integrationId,
          payload,
          rawBody,
          headers: {
            'x-dentally-signature': sign(rawBody),
            'x-dentally-timestamp': String(
              Math.floor(new Date('2026-06-01T08:00:00.000Z').getTime() / 1000),
            ),
          },
          receivedAt,
        }),
      ),
    ).rejects.toThrow(DentallyWebhookSignatureError);

    mockDb.select.mockReturnValueOnce(selectChain<Integration>([integrationFixture()]));
    await expect(
      withTenant(tenantId, () =>
        handleDentallyWebhookEvent({
          tenantId,
          integrationId,
          payload,
          rawBody,
          headers: { 'x-dentally-signature': sign(rawBody) },
          receivedAt,
        }),
      ),
    ).rejects.toThrow(DentallyWebhookSignatureError);
  });
});
