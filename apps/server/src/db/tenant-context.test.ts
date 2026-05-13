import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthorizationError } from '../lib/errors.js';

const mockDb = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('./index.js', () => ({ db: mockDb }));
vi.mock('../config/features.js', () => ({
  features: { databaseRls: true },
}));

import {
  assertTenantAccess,
  getActiveTenantId,
  runWithTenantContext,
  withTenantTransaction,
} from './tenant-context.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tenant execution context', () => {
  it('rejects tenant-scoped access without an active tenant context', () => {
    expect(() => assertTenantAccess('tenant-a')).toThrow(AuthorizationError);
  });

  it('allows access to the active tenant', () => {
    const result = runWithTenantContext({ tenantId: 'tenant-a', source: 'test' }, () =>
      assertTenantAccess('tenant-a'),
    );

    expect(result).toBe('tenant-a');
  });

  it('rejects cross-tenant access inside an active context', () => {
    expect(() =>
      runWithTenantContext({ tenantId: 'tenant-a', source: 'test' }, () =>
        assertTenantAccess('tenant-b'),
      ),
    ).toThrow(AuthorizationError);
  });

  it('does not leak tenant context after runWithTenantContext returns', () => {
    runWithTenantContext({ tenantId: 'tenant-a', source: 'test' }, () => {
      expect(getActiveTenantId()).toBe('tenant-a');
    });

    expect(getActiveTenantId()).toBeUndefined();
  });

  it('sets RLS tenant context inside the transaction scope only', async () => {
    const execute = vi.fn();
    const tx = { execute };
    mockDb.transaction.mockImplementationOnce(
      async (callback: (transaction: typeof tx) => Promise<string>) => callback(tx),
    );

    const result = await withTenantTransaction(
      { tenantId: 'tenant-a', source: 'test' },
      async () => {
        expect(getActiveTenantId()).toBe('tenant-a');
        return 'ok';
      },
    );

    expect(result).toBe('ok');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(getActiveTenantId()).toBeUndefined();
  });
});
