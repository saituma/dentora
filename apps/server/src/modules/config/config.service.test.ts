import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthorizationError } from '../../lib/errors.js';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ db: mockDb }));
vi.mock('../../db/schema.js', () => ({
  tenantConfigVersions: { tenantId: 'tenantId', version: 'version', status: 'status' },
  tenantActiveConfig: { tenantId: 'tenantId' },
  clinicProfile: { tenantId: 'tenantId' },
  services: { id: 'id', tenantId: 'tenantId', active: 'active' },
  bookingRules: { tenantId: 'tenantId' },
  policies: { id: 'id', tenantId: 'tenantId' },
  voiceProfile: { tenantId: 'tenantId' },
  faqLibrary: { id: 'id', tenantId: 'tenantId' },
}));
vi.mock('../../lib/cache.js', () => ({
  cache: {
    invalidateTenantDomain: vi.fn(),
  },
  tenantCacheGet: vi.fn().mockResolvedValue(undefined),
  tenantCacheSet: vi.fn().mockResolvedValue(undefined),
  tenantCacheInvalidateDomain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../lib/crypto.js', () => ({ generateId: () => 'generated-id' }));
vi.mock('../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('../onboarding/onboarding.service.js', () => ({
  listAvailableVoices: vi.fn().mockResolvedValue([]),
}));

import { runWithTenantContext } from '../../db/tenant-context.js';
import { getServices, updateService } from './config.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('config service tenant isolation', () => {
  it('rejects reads without tenant context', async () => {
    await expect(getServices('tenant-a')).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects tenant A reading tenant B config', async () => {
    await expect(
      runWithTenantContext({ tenantId: 'tenant-a', source: 'test' }, () => getServices('tenant-b')),
    ).rejects.toThrow(AuthorizationError);

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects tenant A updating tenant B config', async () => {
    await expect(
      runWithTenantContext({ tenantId: 'tenant-a', source: 'test' }, () =>
        updateService('tenant-b', 'service-b', { serviceName: 'Blocked' }),
      ),
    ).rejects.toThrow(AuthorizationError);

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
