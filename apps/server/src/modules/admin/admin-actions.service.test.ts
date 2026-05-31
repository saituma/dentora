import { beforeEach, describe, expect, it, vi } from 'vitest';

// Call-ordered db.select() mock: each .limit() resolves the next queued result.
const queued: unknown[][] = [];
const dbMock = vi.hoisted(() => ({ queued: [] as unknown[][] }));

vi.mock('../../db/index.js', () => ({
  db: {
    select: () => {
      const builder: Record<string, unknown> = {};
      builder.from = () => builder;
      builder.where = () => builder;
      builder.limit = () => Promise.resolve(dbMock.queued.shift() ?? []);
      return builder;
    },
  },
}));
vi.mock('../../lib/cache.js', () => ({ tenantCacheInvalidateDomain: vi.fn(async () => 0) }));

import { getImpersonationTarget, ASSIGNABLE_TENANT_ROLES } from './admin-actions.service.js';

beforeEach(() => {
  dbMock.queued = queued;
  queued.length = 0;
});

describe('ASSIGNABLE_TENANT_ROLES', () => {
  it('never includes platform_admin (no privilege escalation)', () => {
    expect(ASSIGNABLE_TENANT_ROLES).not.toContain('platform_admin');
    expect(ASSIGNABLE_TENANT_ROLES).toEqual(['owner', 'admin', 'manager', 'viewer']);
  });
});

describe('getImpersonationTarget', () => {
  it('refuses to impersonate a platform admin', async () => {
    queued.push([{ id: 'u1', email: 'a@x.com', role: 'platform_admin' }]);
    await expect(getImpersonationTarget('u1')).rejects.toThrow(/platform admin/i);
  });

  it('refuses a user with no tenant membership', async () => {
    queued.push([{ id: 'u2', email: 'b@x.com', role: 'manager' }]); // user lookup
    queued.push([]); // membership lookup → none
    await expect(getImpersonationTarget('u2')).rejects.toThrow(/no tenant membership/i);
  });

  it('returns the tenant-scoped token payload for a clinic user', async () => {
    queued.push([{ id: 'u3', email: 'c@x.com', role: 'manager' }]);
    queued.push([{ tenantId: 't1', role: 'owner' }]);
    await expect(getImpersonationTarget('u3')).resolves.toEqual({
      userId: 'u3',
      tenantId: 't1',
      role: 'owner',
      email: 'c@x.com',
    });
  });

  it('throws when the user does not exist', async () => {
    queued.push([]);
    await expect(getImpersonationTarget('nope')).rejects.toThrow(/not found/i);
  });
});
