
import { db } from '../../db/index.js';
import { providerRegistry, providerHealthLog, providerPricing } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { cache } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError } from '../../lib/errors.js';
import { generateId } from '../../lib/crypto.js';
import type { InferSelectModel } from 'drizzle-orm';

type Provider = InferSelectModel<typeof providerRegistry>;

export async function registerProvider(input: {
  name: string;
  providerType: 'llm' | 'stt' | 'tts';
  apiEndpoint: string;
  models: string[];
  isActive?: boolean;
  priorityOrder?: number;
  capabilities?: Record<string, unknown>;
}): Promise<Provider> {
  const id = generateId();

  const [provider] = await db
    .insert(providerRegistry)
    .values({
      id,
      name: input.name,
      providerType: input.providerType,
      apiEndpoint: input.apiEndpoint,
      models: input.models,
      isActive: input.isActive ?? true,
      priorityOrder: input.priorityOrder ?? 100,
      capabilities: input.capabilities ?? {},
    })
    .returning();

  logger.info({ providerId: id, name: input.name, type: input.providerType }, 'Provider registered');
  return provider;
}

export async function getActiveProviders(providerType: 'llm' | 'stt' | 'tts'): Promise<Provider[]> {
  const cacheKey = `providers:active:${providerType}`;
  const cached = await cache.getGlobal('providers', cacheKey);
  if (cached) return JSON.parse(cached);

  const providers = await db
    .select()
    .from(providerRegistry)
    .where(and(eq(providerRegistry.providerType, providerType), eq(providerRegistry.isActive, true)))
    .orderBy(providerRegistry.priorityOrder);

  await cache.setGlobal('providers', cacheKey, JSON.stringify(providers), 60);
  return providers;
}

export async function logProviderHealth(input: {
  providerId: string;
  status: 'healthy' | 'degraded' | 'failing';
  latencyMs: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(providerHealthLog).values({
    id: generateId(),
    providerId: input.providerId,
    status: input.status,
    latencyMs: input.latencyMs,
    errorMessage: input.errorMessage,
    metadata: input.metadata ?? {},
  });

  const redis = await cache.getClient();
  if (redis) {
    const key = `provider:health:${input.providerId}`;
    await redis.setex(key, 300, JSON.stringify({
      status: input.status,
      latencyMs: input.latencyMs,
      timestamp: Date.now(),
    }));
  }
}

export async function getProviderHealth(providerId: string) {
  const redis = await cache.getClient();
  if (redis) {
    const cached = await redis.get(`provider:health:${providerId}`);
    if (cached) return JSON.parse(cached);
  }

  const [latest] = await db
    .select()
    .from(providerHealthLog)
    .where(eq(providerHealthLog.providerId, providerId))
    .orderBy(desc(providerHealthLog.checkedAt))
    .limit(1);

  return latest ?? null;
}

export async function setProviderPricing(input: {
  providerId: string;
  model: string;
  inputCostPer1k: string;
  outputCostPer1k: string;
  currency?: string;
}): Promise<void> {
  await db
    .insert(providerPricing)
    .values({
      id: generateId(),
      providerId: input.providerId,
      model: input.model,
      inputCostPer1k: input.inputCostPer1k,
      outputCostPer1k: input.outputCostPer1k,
      currency: input.currency ?? 'USD',
    });
}

export async function deactivateProvider(providerId: string): Promise<void> {
  await db
    .update(providerRegistry)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(providerRegistry.id, providerId));

  const redis = await cache.getClient();
  if (redis) {
    const keys = await redis.keys('global:providers:*');
    if (keys.length) await redis.del(...keys);
  }

  logger.warn({ providerId }, 'Provider deactivated');
}

export async function listProviders(): Promise<Provider[]> {
  return await db
    .select()
    .from(providerRegistry)
    .orderBy(providerRegistry.providerType, providerRegistry.priorityOrder);
}
