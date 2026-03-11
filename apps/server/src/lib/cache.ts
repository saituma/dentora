
import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let redis: Redis | null = null;
const redisDisabled = env.REDIS_DISABLED;
const inMemoryStore = new Map<string, { value: string; expiresAt: number }>();

function getInMemory(key: string): string | null {
  const entry = inMemoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    inMemoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function setInMemory(key: string, value: string, ttlSeconds: number): void {
  inMemoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

const disabledPipeline = {
  zremrangebyscore: () => disabledPipeline,
  zadd: () => disabledPipeline,
  zcard: () => disabledPipeline,
  expire: () => disabledPipeline,
  exec: async () => null,
};

const disabledRedis = {
  on: () => disabledRedis,
  ping: async () => 'PONG',
  quit: async () => undefined,
  get: async (key: string) => getInMemory(key),
  setex: async (key: string, ttl: number, value: string) => {
    setInMemory(key, value, ttl);
    return 'OK';
  },
  del: async (...keys: string[]) => {
    let count = 0;
    for (const key of keys) {
      if (inMemoryStore.delete(key)) {
        count += 1;
      }
    }
    return count;
  },
  scan: async () => ['0', []],
  pipeline: () => disabledPipeline,
} as unknown as Redis;

export async function initRedis(): Promise<void> {
  if (redisDisabled) {
    logger.info('Redis disabled via REDIS_DISABLED');
    return;
  }
  const client = getRedis();
  await client.ping();
}

export function getRedis(): Redis {
  if (redisDisabled) {
    return disabledRedis;
  }
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: false,
    });

    redis.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redisDisabled) return;
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export function tenantKey(tenantId: string, domain: string, identifier: string): string {
  return `tenant:${tenantId}:${domain}:${identifier}`;
}

export function globalKey(domain: string, identifier: string): string {
  return `global:${domain}:${identifier}`;
}

export async function tenantCacheGet<T>(
  tenantId: string,
  domain: string,
  identifier: string,
): Promise<T | null> {
  const key = tenantKey(tenantId, domain, identifier);
  const raw = await getRedis().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    logger.warn({ key }, 'Failed to parse cached value, evicting');
    await getRedis().del(key);
    return null;
  }
}

export async function tenantCacheSet(
  tenantId: string,
  domain: string,
  identifier: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const key = tenantKey(tenantId, domain, identifier);
  await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
}

export async function tenantCacheDel(
  tenantId: string,
  domain: string,
  identifier: string,
): Promise<void> {
  const key = tenantKey(tenantId, domain, identifier);
  await getRedis().del(key);
}

export async function tenantCacheInvalidateDomain(
  tenantId: string,
  domain: string,
): Promise<number> {
  const pattern = `tenant:${tenantId}:${domain}:*`;
  let cursor = '0';
  let deletedCount = 0;

  do {
    const [nextCursor, keys] = await getRedis().scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100,
    );
    cursor = nextCursor;
    if (keys.length > 0) {
      await getRedis().del(...keys);
      deletedCount += keys.length;
    }
  } while (cursor !== '0');

  return deletedCount;
}

export async function globalCacheGet<T>(
  domain: string,
  identifier: string,
): Promise<T | null> {
  const key = globalKey(domain, identifier);
  const raw = await getRedis().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    await getRedis().del(key);
    return null;
  }
}

export async function globalCacheSet(
  domain: string,
  identifier: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const key = globalKey(domain, identifier);
  await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
}

const PHONE_MAPPING_PREFIX = 'phone_mapping';

export async function cachePhoneMapping(
  phoneNumber: string,
  tenantId: string,
  ttlSeconds: number,
): Promise<void> {
  const key = globalKey(PHONE_MAPPING_PREFIX, phoneNumber);
  await getRedis().setex(key, ttlSeconds, tenantId);
}

export async function getCachedPhoneMapping(
  phoneNumber: string,
): Promise<string | null> {
  const key = globalKey(PHONE_MAPPING_PREFIX, phoneNumber);
  return getRedis().get(key);
}

export const cache = {
  getClient: async (): Promise<Redis | null> => {
    try {
      return getRedis();
    } catch {
      return null;
    }
  },

  getTenantScoped: async (tenantId: string, domain: string, identifier: string): Promise<string | null> => {
    try {
      const key = tenantKey(tenantId, domain, identifier);
      return await getRedis().get(key);
    } catch {
      return null;
    }
  },

  setTenantScoped: async (tenantId: string, domain: string, identifier: string, value: string, ttlSeconds: number): Promise<void> => {
    try {
      const key = tenantKey(tenantId, domain, identifier);
      await getRedis().setex(key, ttlSeconds, value);
    } catch (err) {
      logger.warn({ err }, 'Cache set failed (non-critical)');
    }
  },

  invalidateTenantDomain: async (tenantId: string, domain: string): Promise<void> => {
    try {
      await tenantCacheInvalidateDomain(tenantId, domain);
    } catch (err) {
      logger.warn({ err }, 'Cache invalidation failed (non-critical)');
    }
  },

  getGlobal: async (domain: string, identifier: string): Promise<string | null> => {
    try {
      const key = globalKey(domain, identifier);
      return await getRedis().get(key);
    } catch {
      return null;
    }
  },

  setGlobal: async (domain: string, identifier: string, value: string, ttlSeconds: number): Promise<void> => {
    try {
      const key = globalKey(domain, identifier);
      await getRedis().setex(key, ttlSeconds, value);
    } catch (err) {
      logger.warn({ err }, 'Cache set failed (non-critical)');
    }
  },

  setPhoneMapping: async (phoneNumber: string, tenantId: string): Promise<void> => {
    await cachePhoneMapping(phoneNumber, tenantId, 86400);
  },

  getPhoneMapping: async (phoneNumber: string): Promise<string | null> => {
    return getCachedPhoneMapping(phoneNumber);
  },
};
