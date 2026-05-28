import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../../../db/index.js', () => ({ db: mockDb }));
vi.mock('../../../lib/crypto.js', () => ({ generateId: () => 'generated-id' }));

import { runWithTenantContext } from '../../../db/tenant-context.js';
import { AuthorizationError, ValidationError } from '../../../lib/errors.js';
import {
  createExternalEntityMapping,
  listExternalEntityMappingsForLocalEntity,
  type ExternalEntityMapping,
} from './external-entity-mapping.service.js';

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

function withTenant<T>(tenantId: string, callback: () => T): T {
  return runWithTenantContext({ tenantId, source: 'test' }, callback);
}

function mappingFixture(input: {
  id: string;
  externalProvider: 'google_calendar' | 'dentally' | 'soe_exact' | 'cs_r4_plus';
  externalEntityId: string;
}): ExternalEntityMapping {
  return {
    id: input.id,
    tenantId: 'tenant-a',
    localEntityType: 'appointment',
    localEntityId: 'appt-123',
    externalProvider: input.externalProvider,
    externalEntityType: 'appointment',
    externalEntityId: input.externalEntityId,
    integrationId: `${input.externalProvider}-integration-a`,
    metadata: {},
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

function selectWhereChain<T>(result: T[]): SelectChain<T> {
  const chain = selectChain<T>(result);
  chain.where.mockResolvedValue(result);
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('external entity mapping service', () => {
  it('creates an external mapping', async () => {
    const mapping = mappingFixture({
      id: 'mapping-a',
      externalProvider: 'google_calendar',
      externalEntityId: 'evt-456',
    });
    mockDb.select.mockReturnValueOnce(selectChain<ExternalEntityMapping>([]));
    const insert = insertChain<ExternalEntityMapping>([mapping]);
    mockDb.insert.mockReturnValueOnce(insert);

    const result = await withTenant('tenant-a', () =>
      createExternalEntityMapping({
        tenantId: 'tenant-a',
        localEntityType: 'appointment',
        localEntityId: 'appt-123',
        externalProvider: 'google_calendar',
        externalEntityType: 'appointment',
        externalEntityId: 'evt-456',
        integrationId: 'google_calendar-integration-a',
      }),
    );

    expect(result).toBe(mapping);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        localEntityId: 'appt-123',
        externalProvider: 'google_calendar',
        externalEntityId: 'evt-456',
      }),
    );
  });

  it('prevents duplicate external mappings by returning the existing exact mapping', async () => {
    const existing = mappingFixture({
      id: 'mapping-a',
      externalProvider: 'google_calendar',
      externalEntityId: 'evt-456',
    });
    mockDb.select.mockReturnValueOnce(selectChain<ExternalEntityMapping>([existing]));

    const result = await withTenant('tenant-a', () =>
      createExternalEntityMapping({
        tenantId: 'tenant-a',
        localEntityType: 'appointment',
        localEntityId: 'appt-123',
        externalProvider: 'google_calendar',
        externalEntityType: 'appointment',
        externalEntityId: 'evt-456',
        integrationId: 'google_calendar-integration-a',
      }),
    );

    expect(result).toBe(existing);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('rejects an external id already mapped to a different local appointment', async () => {
    const existing = {
      ...mappingFixture({
        id: 'mapping-a',
        externalProvider: 'google_calendar',
        externalEntityId: 'evt-456',
      }),
      localEntityId: 'other-appointment',
    };
    mockDb.select.mockReturnValueOnce(selectChain<ExternalEntityMapping>([existing]));

    await expect(
      withTenant('tenant-a', () =>
        createExternalEntityMapping({
          tenantId: 'tenant-a',
          localEntityType: 'appointment',
          localEntityId: 'appt-123',
          externalProvider: 'google_calendar',
          externalEntityType: 'appointment',
          externalEntityId: 'evt-456',
          integrationId: 'google_calendar-integration-a',
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('allows the same local appointment to map to multiple providers', async () => {
    const google = mappingFixture({
      id: 'mapping-google',
      externalProvider: 'google_calendar',
      externalEntityId: 'evt-456',
    });
    const dentally = mappingFixture({
      id: 'mapping-dentally',
      externalProvider: 'dentally',
      externalEntityId: 'dent-789',
    });
    mockDb.select.mockReturnValueOnce(selectWhereChain<ExternalEntityMapping>([google, dentally]));

    const result = await withTenant('tenant-a', () =>
      listExternalEntityMappingsForLocalEntity({
        tenantId: 'tenant-a',
        localEntityType: 'appointment',
        localEntityId: 'appt-123',
      }),
    );

    expect(result.map((mapping) => mapping.externalProvider)).toEqual([
      'google_calendar',
      'dentally',
    ]);
  });

  it('enforces tenant isolation before querying', async () => {
    await expect(
      withTenant('tenant-a', () =>
        listExternalEntityMappingsForLocalEntity({
          tenantId: 'tenant-b',
          localEntityType: 'appointment',
          localEntityId: 'appt-123',
        }),
      ),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
