import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
const mockDentallyReport = vi.hoisted(() => vi.fn());

vi.mock('../../../db/index.js', () => ({ db: mockDb }));
vi.mock('../../../lib/crypto.js', () => ({ generateId: () => 'generated-id' }));
vi.mock('../adapters/dentally/dentally-verification.service.js', () => ({
  dentallyVerificationService: {
    generateVerificationReport: mockDentallyReport,
  },
}));

import { runWithTenantContext } from '../../../db/tenant-context.js';
import { AuthorizationError, ValidationError } from '../../../lib/errors.js';
import {
  getTenantSchedulingConfig,
  upsertTenantSchedulingConfig,
  type TenantSchedulingConfig,
} from './tenant-scheduling-config.service.js';
import type { Integration } from '../../integrations/integration.types.js';
import type { SchedulingProviderKey } from '../domain/appointment.types.js';

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

interface UpdateChain<T> {
  set: Mock;
  where: Mock;
  returning: Mock;
  result: T[];
}

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

function integrationFixture(input: { id: string; provider: string }): Integration {
  return {
    id: input.id,
    tenantId: 'tenant-a',
    configVersion: 1,
    integrationType: 'scheduling',
    provider: input.provider,
    status: 'active',
    config: {},
    credentials: {},
    capabilities: {},
    lastSyncAt: null,
    healthStatus: 'healthy',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };
}

function configFixture(
  input: {
    primaryProvider?: SchedulingProviderKey;
    fallbackProvider?: SchedulingProviderKey | null;
  } = {},
): TenantSchedulingConfig {
  return {
    id: 'config-a',
    tenantId: 'tenant-a',
    primaryProvider: input.primaryProvider ?? 'google_calendar',
    primaryIntegrationId: 'integration-a',
    fallbackProvider: input.fallbackProvider ?? null,
    fallbackIntegrationId: input.fallbackProvider ? 'fallback-integration-a' : null,
    sourceOfTruth: 'local_ledger',
    googleSyncMode: 'fallback_only',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockDentallyReport.mockResolvedValue({
    productionRecommendation: 'CONTROLLED PILOT READY',
    productionBlockers: [],
  });
});

describe('tenant scheduling config service', () => {
  it('reads tenant scheduling config with tenant isolation', async () => {
    const config = configFixture();
    mockDb.select.mockReturnValueOnce(selectChain<TenantSchedulingConfig>([config]));

    const result = await withTenant('tenant-a', () => getTenantSchedulingConfig('tenant-a'));

    expect(result).toBe(config);
  });

  it('rejects cross-tenant reads before querying', async () => {
    await expect(
      withTenant('tenant-a', () => getTenantSchedulingConfig('tenant-b')),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('creates a config for a valid provider and integration', async () => {
    const config = configFixture();
    mockDb.select
      .mockReturnValueOnce(
        selectChain<Integration>([
          integrationFixture({ id: 'integration-a', provider: 'google_calendar' }),
        ]),
      )
      .mockReturnValueOnce(selectChain<TenantSchedulingConfig>([]));
    const insert = insertChain<TenantSchedulingConfig>([config]);
    mockDb.insert.mockReturnValueOnce(insert);

    const result = await withTenant('tenant-a', () =>
      upsertTenantSchedulingConfig({
        tenantId: 'tenant-a',
        primaryProvider: 'google_calendar',
        primaryIntegrationId: 'integration-a',
        sourceOfTruth: 'local_ledger',
        googleSyncMode: 'fallback_only',
      }),
    );

    expect(result).toBe(config);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        primaryProvider: 'google_calendar',
        primaryIntegrationId: 'integration-a',
      }),
    );
  });

  it('keeps one active config per tenant by updating the existing row', async () => {
    const existing = configFixture();
    const updated = { ...existing, googleSyncMode: 'mirror_busy' as const };
    mockDb.select
      .mockReturnValueOnce(
        selectChain<Integration>([
          integrationFixture({ id: 'integration-a', provider: 'google_calendar' }),
        ]),
      )
      .mockReturnValueOnce(selectChain<TenantSchedulingConfig>([existing]));
    const update = updateChain<TenantSchedulingConfig>([updated]);
    mockDb.update.mockReturnValueOnce(update);

    const result = await withTenant('tenant-a', () =>
      upsertTenantSchedulingConfig({
        tenantId: 'tenant-a',
        primaryProvider: 'google_calendar',
        primaryIntegrationId: 'integration-a',
        sourceOfTruth: 'local_ledger',
        googleSyncMode: 'mirror_busy',
      }),
    );

    expect(result).toBe(updated);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({ googleSyncMode: 'mirror_busy' }),
    );
  });

  it('rejects invalid providers', async () => {
    await expect(
      withTenant('tenant-a', () =>
        upsertTenantSchedulingConfig({
          tenantId: 'tenant-a',
          primaryProvider: 'bad_provider' as unknown as SchedulingProviderKey,
          primaryIntegrationId: 'integration-a',
          sourceOfTruth: 'local_ledger',
          googleSyncMode: 'fallback_only',
        }),
      ),
    ).rejects.toThrow('Invalid primary scheduling provider');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects SOE/EXACT as a live scheduling provider until vendor access is approved', async () => {
    await expect(
      withTenant('tenant-a', () =>
        upsertTenantSchedulingConfig({
          tenantId: 'tenant-a',
          primaryProvider: 'soe_exact',
          primaryIntegrationId: 'soe-integration-a',
          sourceOfTruth: 'pms',
          googleSyncMode: 'fallback_only',
        }),
      ),
    ).rejects.toThrow('soe_exact cannot be selected as scheduling primary provider');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects CS R4+ as a scheduling fallback until vendor access is approved', async () => {
    await expect(
      withTenant('tenant-a', () =>
        upsertTenantSchedulingConfig({
          tenantId: 'tenant-a',
          primaryProvider: 'google_calendar',
          primaryIntegrationId: 'integration-a',
          fallbackProvider: 'cs_r4_plus',
          fallbackIntegrationId: 'r4-integration-a',
          sourceOfTruth: 'local_ledger',
          googleSyncMode: 'fallback_only',
        }),
      ),
    ).rejects.toThrow('cs_r4_plus cannot be selected as scheduling fallback provider');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects integration/provider mismatches', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain<Integration>([integrationFixture({ id: 'integration-a', provider: 'dentally' })]),
    );

    await expect(
      withTenant('tenant-a', () =>
        upsertTenantSchedulingConfig({
          tenantId: 'tenant-a',
          primaryProvider: 'google_calendar',
          primaryIntegrationId: 'integration-a',
          sourceOfTruth: 'local_ledger',
          googleSyncMode: 'fallback_only',
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects Dentally primary scheduling before sandbox verification is ready', async () => {
    mockDentallyReport.mockResolvedValueOnce({
      productionRecommendation: 'NOT READY',
      productionBlockers: ['Missing or failed verification checks: webhookDelivery'],
    });
    mockDb.select.mockReturnValueOnce(
      selectChain<Integration>([
        integrationFixture({ id: 'dentally-integration-a', provider: 'dentally' }),
      ]),
    );

    await expect(
      withTenant('tenant-a', () =>
        upsertTenantSchedulingConfig({
          tenantId: 'tenant-a',
          primaryProvider: 'dentally',
          primaryIntegrationId: 'dentally-integration-a',
          sourceOfTruth: 'pms',
          googleSyncMode: 'fallback_only',
        }),
      ),
    ).rejects.toThrow(
      'Dentally cannot be selected as scheduling primary provider until sandbox verification is ready',
    );
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('accepts an explicit fallback config', async () => {
    const config = configFixture({
      primaryProvider: 'dentally',
      fallbackProvider: 'google_calendar',
    });
    mockDb.select
      .mockReturnValueOnce(
        selectChain<Integration>([
          integrationFixture({ id: 'dentally-integration-a', provider: 'dentally' }),
        ]),
      )
      .mockReturnValueOnce(
        selectChain<Integration>([
          integrationFixture({ id: 'fallback-integration-a', provider: 'google_calendar' }),
        ]),
      )
      .mockReturnValueOnce(selectChain<TenantSchedulingConfig>([]));
    mockDb.insert.mockReturnValueOnce(insertChain<TenantSchedulingConfig>([config]));

    const result = await withTenant('tenant-a', () =>
      upsertTenantSchedulingConfig({
        tenantId: 'tenant-a',
        primaryProvider: 'dentally',
        primaryIntegrationId: 'dentally-integration-a',
        fallbackProvider: 'google_calendar',
        fallbackIntegrationId: 'fallback-integration-a',
        sourceOfTruth: 'pms',
        googleSyncMode: 'fallback_only',
      }),
    );

    expect(result.fallbackProvider).toBe('google_calendar');
    expect(mockDentallyReport).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      integrationId: 'dentally-integration-a',
    });
  });
});
