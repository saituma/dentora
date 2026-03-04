
import { db, checkDbHealth } from '../../db/index.js';
import { tenantRegistry, callSessions, providerRegistry, providerHealthLog, platformConfig } from '../../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';
import { cache } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';

export async function getPlatformHealth(): Promise<{
  status: string;
  services: Record<string, boolean>;
  timestamp: string;
}> {
  const dbOk = await checkDbHealth();

  let redisOk = false;
  try {
    const redis = await cache.getClient();
    if (redis) {
      await redis.ping();
      redisOk = true;
    }
  } catch {
    redisOk = false;
  }

  const allOk = dbOk && redisOk;

  return {
    status: allOk ? 'healthy' : 'degraded',
    services: {
      database: dbOk,
      redis: redisOk,
    },
    timestamp: new Date().toISOString(),
  };
}

export async function getPlatformStats(): Promise<{
  totalTenants: number;
  activeTenants: number;
  totalCallsToday: number;
  activeProviders: number;
}> {
  const [tenantStats] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      active: sql<number>`COUNT(*) FILTER (WHERE ${tenantRegistry.status} = 'active')::int`,
    })
    .from(tenantRegistry);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [callStats] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(callSessions)
    .where(sql`${callSessions.startedAt} >= ${today}`);

  const [providerStats] = await db
    .select({
      active: sql<number>`COUNT(*) FILTER (WHERE ${providerRegistry.isActive} = true)::int`,
    })
    .from(providerRegistry);

  return {
    totalTenants: tenantStats.total,
    activeTenants: tenantStats.active,
    totalCallsToday: callStats.count,
    activeProviders: providerStats.active,
  };
}

export async function getPlatformConfig(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(platformConfig)
    .where(eq(platformConfig.key, key))
    .limit(1);

  return (row?.value as string) ?? null;
}

export async function setPlatformConfig(key: string, value: string, description?: string): Promise<void> {
  await db
    .insert(platformConfig)
    .values({ key, value, description })
    .onConflictDoUpdate({
      target: platformConfig.key,
      set: { value, updatedAt: new Date() },
    });
}
