import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
const mockInvalidateTenantDomain = vi.hoisted(() => vi.fn());

vi.mock('../../../db/index.js', () => ({ db: mockDb }));
vi.mock('../../../lib/cache.js', () => ({
  cache: { invalidateTenantDomain: mockInvalidateTenantDomain },
}));
vi.mock('../../../lib/crypto.js', () => ({ generateId: () => 'generated-id' }));
vi.mock('../../../lib/encryption.js', () => ({
  encrypt: (value: string) => `encrypted:${value}`,
}));
vi.mock('../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../integrations/google-calendar.shared.js', () => ({
  resolveValidGoogleAccessToken: vi.fn(),
}));

import { runWithTenantContext } from '../../../db/tenant-context.js';
import { AuthorizationError, ValidationError } from '../../../lib/errors.js';
import type { Integration } from '../../integrations/integration.types.js';
import type { TenantSchedulingConfig } from './tenant-scheduling-config.service.js';
import {
  getTenantSchedulingConfig,
  updateTenantSchedulingConfig,
} from './tenant-scheduling-config.service.js';
import { listPmsIntegrationEvents } from './pms-integration-events.service.js';
import { getPmsProviderOverview } from './pms-provider-overview.service.js';
import { configurePmsProvider, getPmsProviderDetail } from './pms-provider-detail.service.js';

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

type VerificationRun = {
  id: string;
  tenantId: string;
  integrationId: string;
  verificationType: string;
  status: string;
  requestMetadata: Record<string, unknown>;
  responseMetadata: Record<string, unknown>;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
};

type WebhookEvent = {
  id: string;
  tenantId: string;
  provider: 'google_calendar' | 'dentally' | 'soe_exact' | 'cs_r4_plus';
  integrationId: string;
  externalEventId: string;
  eventType: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  status: string;
  receivedAt: Date;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

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

function integrationFixture(input: Partial<Integration> = {}): Integration {
  return {
    id: input.id ?? 'integration-a',
    tenantId: input.tenantId ?? 'tenant-a',
    configVersion: 1,
    integrationType: input.integrationType ?? 'calendar',
    provider: input.provider ?? 'google_calendar',
    status: input.status ?? 'active',
    config: input.config ?? {},
    credentials: input.credentials ?? {},
    capabilities: {},
    lastSyncAt: input.lastSyncAt ?? new Date('2026-05-01T10:00:00.000Z'),
    healthStatus: input.healthStatus ?? 'healthy',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };
}

function configFixture(input: Partial<TenantSchedulingConfig> = {}): TenantSchedulingConfig {
  return {
    id: 'config-a',
    tenantId: input.tenantId ?? 'tenant-a',
    primaryProvider: input.primaryProvider ?? 'google_calendar',
    primaryIntegrationId: input.primaryIntegrationId ?? 'integration-a',
    fallbackProvider: input.fallbackProvider ?? null,
    fallbackIntegrationId: input.fallbackIntegrationId ?? null,
    sourceOfTruth: input.sourceOfTruth ?? 'google_calendar',
    googleSyncMode: input.googleSyncMode ?? 'fallback_only',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };
}

function verificationRunFixture(input: Partial<VerificationRun> = {}): VerificationRun {
  return {
    id: input.id ?? 'run-a',
    tenantId: input.tenantId ?? 'tenant-a',
    integrationId: input.integrationId ?? 'dentally-integration-a',
    verificationType: input.verificationType ?? 'connectivity',
    status: input.status ?? 'pass',
    requestMetadata: input.requestMetadata ?? {},
    responseMetadata: input.responseMetadata ?? {},
    durationMs: input.durationMs ?? 12,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    createdAt: input.createdAt ?? new Date('2026-05-01T00:00:00.000Z'),
  };
}

function webhookFixture(input: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: input.id ?? 'webhook-a',
    tenantId: input.tenantId ?? 'tenant-a',
    provider: input.provider ?? 'dentally',
    integrationId: input.integrationId ?? 'dentally-integration-a',
    externalEventId: input.externalEventId ?? 'event-a',
    eventType: input.eventType ?? 'appointment.created',
    payloadHash: 'hash',
    payload: input.payload ?? { patientName: 'Do not return' },
    status: input.status ?? 'received',
    receivedAt: input.receivedAt ?? new Date('2026-05-01T00:00:00.000Z'),
    processedAt: input.processedAt ?? null,
    createdAt: input.createdAt ?? new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-05-01T00:00:00.000Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PMS provider dashboard services', () => {
  it('provider overview returns all four providers with fail-closed vendor statuses', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain<TenantSchedulingConfig>([configFixture()]))
      .mockReturnValueOnce(
        selectChain<Integration>([
          integrationFixture({ provider: 'google_calendar', integrationType: 'calendar' }),
        ]),
      )
      .mockReturnValueOnce(selectChain<VerificationRun>([]));

    const result = await withTenant('tenant-a', () => getPmsProviderOverview('tenant-a'));

    expect(result.map((item) => item.provider)).toEqual([
      'google_calendar',
      'dentally',
      'soe_exact',
      'cs_r4_plus',
    ]);
    expect(result.find((item) => item.provider === 'google_calendar')?.status).toBe('connected');
    expect(result.find((item) => item.provider === 'dentally')?.status).toBe(
      'verification_required',
    );
    expect(result.find((item) => item.provider === 'soe_exact')?.status).toBe(
      'vendor_access_required',
    );
    expect(result.find((item) => item.provider === 'cs_r4_plus')?.status).toBe(
      'vendor_access_required',
    );
  });

  it('scores vendor readiness from approved checklist evidence without marking shells live', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain<TenantSchedulingConfig>([configFixture()]))
      .mockReturnValueOnce(
        selectChain<Integration>([
          integrationFixture({ provider: 'google_calendar', integrationType: 'calendar' }),
          integrationFixture({
            id: 'soe-integration-a',
            provider: 'soe_exact',
            integrationType: 'pms',
            config: {
              readinessChecklist: [
                { id: 'api_docs_available', status: 'approved' },
                { id: 'sandbox_demo_available', status: 'approved' },
                { id: 'appointment_read_supported', status: 'approved' },
              ],
            },
          }),
        ]),
      )
      .mockReturnValueOnce(selectChain<VerificationRun>([]));

    const result = await withTenant('tenant-a', () => getPmsProviderOverview('tenant-a'));
    const soe = result.find((item) => item.provider === 'soe_exact');

    expect(soe?.status).toBe('vendor_access_required');
    expect(soe?.readinessScore).toBeGreaterThan(0);
    expect(soe?.warnings).toContain('11 production readiness checks remain open.');
  });

  it('provider detail is tenant isolated and does not expose credentials', async () => {
    await expect(
      withTenant('tenant-a', () =>
        getPmsProviderDetail({ tenantId: 'tenant-b', provider: 'dentally' }),
      ),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('stores SOE/R4 configure notes without returning a connected status or plain secrets', async () => {
    const inserted = integrationFixture({
      id: 'soe-integration-a',
      integrationType: 'pms',
      provider: 'soe_exact',
      status: 'disconnected',
    });
    mockDb.select
      .mockReturnValueOnce(selectChain<Integration>([]))
      .mockReturnValueOnce(selectChain<Integration>([]));
    const insert = insertChain<Integration>([inserted]);
    mockDb.insert.mockReturnValueOnce(insert);
    mockDb.update.mockReturnValueOnce(updateChain<Integration>([inserted]));
    mockDb.select
      .mockReturnValueOnce(selectChain<Integration>([inserted]))
      .mockReturnValueOnce(selectChain<TenantSchedulingConfig>([]))
      .mockReturnValueOnce(selectChain<VerificationRun>([]))
      .mockReturnValueOnce(selectChain<WebhookEvent>([]));

    const detail = await withTenant('tenant-a', () =>
      configurePmsProvider({
        tenantId: 'tenant-a',
        provider: 'soe_exact',
        body: {
          vendorNotes: 'Docs requested',
          credentials: { apiKey: 'plain-secret' },
          readinessChecklist: [
            {
              id: 'api_docs_available',
              status: 'approved',
              evidenceUrl: 'https://example.com/docs',
            },
            { id: 'sandbox_demo_available', status: 'requested' },
          ],
        },
      }),
    );

    const stored = insert.values.mock.calls[0]?.[0] as {
      credentials?: Record<string, unknown>;
      config?: Record<string, unknown>;
    };
    expect(stored.credentials?.apiKey).toBeUndefined();
    expect(stored.credentials?.encryptedApiKey).toBe('encrypted:plain-secret');
    expect(stored.config?.productionEnabled).toBe(false);
    expect(stored.config?.liveImplementationAvailable).toBe(false);
    expect(stored.config?.productionReadiness).toMatchObject({
      provider: 'soe_exact',
      readyForProduction: false,
    });
    expect(stored.config?.readinessChecklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'api_docs_available',
          evidenceUrl: 'https://example.com/docs',
        }),
      ]),
    );
    expect(detail.connectionStatus).toBe('vendor_access_required');
    expect(detail.readinessChecklist.map((item) => item.id)).toContain('live_adapter_implemented');
  });

  it('integration events redact PHI/secrets and paginate tenant-scoped results', async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain<VerificationRun>([
          verificationRunFixture({
            id: 'run-a',
            errorMessage: 'patient Jane +15555550123 token abc123',
            createdAt: new Date('2026-05-02T00:00:00.000Z'),
          }),
        ]),
      )
      .mockReturnValueOnce(
        selectChain<WebhookEvent>([
          webhookFixture({ id: 'webhook-a', createdAt: new Date('2026-05-01T00:00:00.000Z') }),
        ]),
      );

    const result = await withTenant('tenant-a', () =>
      listPmsIntegrationEvents({
        tenantId: 'tenant-a',
        filters: { provider: 'dentally', page: 1, perPage: 1 },
      }),
    );

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.errorSummary).not.toContain('Jane');
    expect(result.data[0]?.errorSummary).not.toContain('+15555550123');
    expect(result.data[0]?.errorSummary).not.toContain('abc123');
    expect(result.data[0]).not.toHaveProperty('payload');
  });

  it('scheduling config rejects invalid provider and fallback provider collisions', async () => {
    mockDb.select.mockReturnValueOnce(selectChain<TenantSchedulingConfig>([]));
    await expect(
      withTenant('tenant-a', () =>
        updateTenantSchedulingConfig({
          tenantId: 'tenant-a',
          primaryProvider: 'bad_provider' as never,
          primaryIntegrationId: 'integration-a',
        }),
      ),
    ).rejects.toThrow(ValidationError);

    mockDb.select
      .mockReturnValueOnce(selectChain<TenantSchedulingConfig>([]))
      .mockReturnValueOnce(
        selectChain<Integration>([
          integrationFixture({ id: 'integration-a', provider: 'google_calendar' }),
        ]),
      );

    await expect(
      withTenant('tenant-a', () =>
        updateTenantSchedulingConfig({
          tenantId: 'tenant-a',
          primaryProvider: 'google_calendar',
          primaryIntegrationId: 'integration-a',
          fallbackProvider: 'google_calendar',
          fallbackIntegrationId: 'fallback-a',
        }),
      ),
    ).rejects.toThrow('Fallback provider must differ from primary provider');
  });

  it('scheduling config rejects integration ids from other tenants by treating them as not found', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain<TenantSchedulingConfig>([]))
      .mockReturnValueOnce(selectChain<Integration>([]));

    await expect(
      withTenant('tenant-a', () =>
        updateTenantSchedulingConfig({
          tenantId: 'tenant-a',
          primaryProvider: 'dentally',
          primaryIntegrationId: '00000000-0000-0000-0000-000000000123',
          sourceOfTruth: 'pms',
        }),
      ),
    ).rejects.toThrow('Scheduling primary integration not found');
  });

  it('can read tenant scheduling config', async () => {
    const config = configFixture();
    mockDb.select.mockReturnValueOnce(selectChain<TenantSchedulingConfig>([config]));

    const result = await withTenant('tenant-a', () => getTenantSchedulingConfig('tenant-a'));

    expect(result).toBe(config);
  });
});
