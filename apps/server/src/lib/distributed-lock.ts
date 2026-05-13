import { randomUUID } from 'node:crypto';
import { getRedis } from './cache.js';

export interface DistributedLockInput {
  key: string;
  ttlMs: number;
  ownerToken?: string;
}

export interface DistributedLockAcquired {
  acquired: true;
  key: string;
  ownerToken: string;
  release: () => Promise<boolean>;
}

export interface DistributedLockNotAcquired {
  acquired: false;
  key: string;
  ownerToken: string;
  reason: 'lock_held' | 'redis_unavailable';
  error?: unknown;
}

export type DistributedLockResult = DistributedLockAcquired | DistributedLockNotAcquired;

const RELEASE_IF_OWNER_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export async function acquireDistributedLock(
  input: DistributedLockInput,
): Promise<DistributedLockResult> {
  const ownerToken = input.ownerToken ?? randomUUID();

  try {
    const redis = getRedis();
    const result = await redis.set(input.key, ownerToken, 'PX', input.ttlMs, 'NX');
    if (result !== 'OK') {
      return {
        acquired: false,
        key: input.key,
        ownerToken,
        reason: 'lock_held',
      };
    }

    return {
      acquired: true,
      key: input.key,
      ownerToken,
      release: async () => {
        const releaseResult = await redis.eval(RELEASE_IF_OWNER_SCRIPT, 1, input.key, ownerToken);
        return releaseResult === 1;
      },
    };
  } catch (error) {
    return {
      acquired: false,
      key: input.key,
      ownerToken,
      reason: 'redis_unavailable',
      error,
    };
  }
}
