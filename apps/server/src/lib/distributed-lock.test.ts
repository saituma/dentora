import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedis = vi.hoisted(() => ({
  set: vi.fn(),
  eval: vi.fn(),
}));

vi.mock('./cache.js', () => ({
  getRedis: vi.fn(() => mockRedis),
}));

import { acquireDistributedLock } from './distributed-lock.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('distributed lock', () => {
  it('acquires a Redis lock with key, owner token, and TTL', async () => {
    mockRedis.set.mockResolvedValueOnce('OK');

    const lock = await acquireDistributedLock({
      key: 'lock:test',
      ownerToken: 'owner-a',
      ttlMs: 30_000,
    });

    expect(lock.acquired).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith('lock:test', 'owner-a', 'PX', 30_000, 'NX');
  });

  it('reports lock held when Redis SET NX does not acquire', async () => {
    mockRedis.set.mockResolvedValueOnce(null);

    const lock = await acquireDistributedLock({
      key: 'lock:test',
      ownerToken: 'owner-a',
      ttlMs: 30_000,
    });

    expect(lock).toMatchObject({
      acquired: false,
      key: 'lock:test',
      ownerToken: 'owner-a',
      reason: 'lock_held',
    });
  });

  it('releases only when owner token matches', async () => {
    mockRedis.set.mockResolvedValueOnce('OK');
    mockRedis.eval.mockResolvedValueOnce(0);

    const lock = await acquireDistributedLock({
      key: 'lock:test',
      ownerToken: 'owner-a',
      ttlMs: 30_000,
    });

    if (!lock.acquired) throw new Error('expected lock acquisition');
    await expect(lock.release()).resolves.toBe(false);
    expect(mockRedis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'lock:test', 'owner-a');
  });

  it('reports Redis unavailable without throwing', async () => {
    const error = new Error('redis down');
    mockRedis.set.mockRejectedValueOnce(error);

    const lock = await acquireDistributedLock({
      key: 'lock:test',
      ownerToken: 'owner-a',
      ttlMs: 30_000,
    });

    expect(lock).toMatchObject({
      acquired: false,
      key: 'lock:test',
      ownerToken: 'owner-a',
      reason: 'redis_unavailable',
      error,
    });
  });
});
