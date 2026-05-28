import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
const mockInvalidateTenantDomain = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({ db: mockDb }));
vi.mock('../../lib/cache.js', () => ({
  cache: { invalidateTenantDomain: mockInvalidateTenantDomain },
}));
vi.mock('../../lib/crypto.js', () => ({ generateId: () => 'generated-id' }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('./google-calendar.shared.js', () => ({
  resolveValidGoogleAccessToken: vi.fn(),
}));

import {
  getIntegrationByProvider,
  upsertIntegration,
  type IntegrationTypeValue,
} from './integration-registry.js';
import type { Integration } from './integration.types.js';

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

function integrationFixture(input: {
  id: string;
  integrationType: IntegrationTypeValue;
  provider: string;
}): Integration {
  return {
    id: input.id,
    tenantId: 'tenant-a',
    configVersion: 1,
    integrationType: input.integrationType,
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
});

describe('integration registry provider safety', () => {
  it('stores different scheduling providers for the same tenant without overwriting', async () => {
    const google = integrationFixture({
      id: 'google-integration-a',
      integrationType: 'scheduling',
      provider: 'google_calendar',
    });
    const dentally = integrationFixture({
      id: 'dentally-integration-a',
      integrationType: 'scheduling',
      provider: 'dentally',
    });
    mockDb.select.mockReturnValueOnce(selectChain<Integration>([]));
    mockDb.insert.mockReturnValueOnce(insertChain<Integration>([google]));
    mockDb.select.mockReturnValueOnce(selectChain<Integration>([]));
    mockDb.insert.mockReturnValueOnce(insertChain<Integration>([dentally]));

    const googleResult = await upsertIntegration({
      tenantId: 'tenant-a',
      integrationType: 'scheduling',
      provider: 'google_calendar',
      config: {},
    });
    const dentallyResult = await upsertIntegration({
      tenantId: 'tenant-a',
      integrationType: 'scheduling',
      provider: 'dentally',
      config: {},
    });

    expect(googleResult.id).toBe('google-integration-a');
    expect(dentallyResult.id).toBe('dentally-integration-a');
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('looks up the requested provider instead of any integration with the same type', async () => {
    const dentally = integrationFixture({
      id: 'dentally-integration-a',
      integrationType: 'scheduling',
      provider: 'dentally',
    });
    mockDb.select.mockReturnValueOnce(selectChain<Integration>([dentally]));

    const result = await getIntegrationByProvider({
      tenantId: 'tenant-a',
      integrationType: 'scheduling',
      provider: 'dentally',
    });

    expect(result?.provider).toBe('dentally');
    expect(result?.id).toBe('dentally-integration-a');
  });

  it('updates only the matching provider collision instead of inserting a duplicate', async () => {
    const existing = integrationFixture({
      id: 'dentally-integration-a',
      integrationType: 'scheduling',
      provider: 'dentally',
    });
    const updated = { ...existing, config: { siteId: 'site-a' } };
    mockDb.select.mockReturnValueOnce(selectChain<Integration>([existing]));
    const update = updateChain<Integration>([updated]);
    mockDb.update.mockReturnValueOnce(update);

    const result = await upsertIntegration({
      tenantId: 'tenant-a',
      integrationType: 'scheduling',
      provider: 'dentally',
      config: { siteId: 'site-a' },
    });

    expect(result).toBe(updated);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { siteId: 'site-a' },
      }),
    );
  });

  it('encrypts Dentally credentials before storing them in the integration registry', async () => {
    const dentally = integrationFixture({
      id: 'dentally-integration-a',
      integrationType: 'scheduling',
      provider: 'dentally',
    });
    mockDb.select.mockReturnValueOnce(selectChain<Integration>([]));
    const insert = insertChain<Integration>([dentally]);
    mockDb.insert.mockReturnValueOnce(insert);

    await upsertIntegration({
      tenantId: 'tenant-a',
      integrationType: 'scheduling',
      provider: 'dentally',
      config: {},
      credentials: {
        accessToken: 'dentally-access-token',
        refreshToken: 'dentally-refresh-token',
        webhookSecret: 'dentally-webhook-secret',
        scopes: ['appointment:read', 'appointment:create'],
        practiceId: 'practice-a',
      },
    });

    const stored = insert.values.mock.calls[0]?.[0] as {
      credentials?: Record<string, unknown>;
    };
    expect(stored.credentials?.accessToken).toBeUndefined();
    expect(stored.credentials?.refreshToken).toBeUndefined();
    expect(stored.credentials?.webhookSecret).toBeUndefined();
    expect(stored.credentials?.encryptedAccessToken).toEqual(expect.any(String));
    expect(stored.credentials?.encryptedAccessToken).not.toBe('dentally-access-token');
    expect(stored.credentials?.encryptedRefreshToken).toEqual(expect.any(String));
    expect(stored.credentials?.encryptedRefreshToken).not.toBe('dentally-refresh-token');
    expect(stored.credentials?.encryptedWebhookSecret).toEqual(expect.any(String));
    expect(stored.credentials?.encryptedWebhookSecret).not.toBe('dentally-webhook-secret');
    expect(stored.credentials?.scopes).toEqual(['appointment:read', 'appointment:create']);
    expect(stored.credentials?.practiceId).toBe('practice-a');
  });
});
