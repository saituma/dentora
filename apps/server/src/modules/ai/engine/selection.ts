
import { db } from '../../../db/index.js';
import { providerRegistry, providerHealthLog, providerPricing } from '../../../db/schema.js';
import { eq, and, desc, gte } from 'drizzle-orm';
import { cache } from '../../../lib/cache.js';
import { logger } from '../../../lib/logger.js';
import { AllProvidersFailedError, ProviderError } from '../../../lib/errors.js';
import {
  getLlmAdapter,
  getSttAdapter,
  getTtsAdapter,
  type LlmProvider,
  type SttProvider,
  type TtsProvider,
  type LlmRequest,
  type LlmResponse,
  type SttRequest,
  type SttResponse,
  type TtsRequest,
  type TtsResponse,
} from '../providers/index.js';

export type WorkloadType = 'llm' | 'stt' | 'tts';

export interface SelectionRequest {
  workloadType: WorkloadType;
  tenantId: string;
  language?: string;
  maxLatencyMs?: number;
  minReliability?: number;
}

export interface ProviderCandidate {
  id: string;
  name: string;
  providerType: string;
  priorityOrder: number;
  costPer1k: number;
  avgLatencyMs: number;
  reliability: number;
  isHealthy: boolean;
}

export interface SelectionResult {
  providerId: string;
  providerName: string;
  selectionReason: {
    cost: number;
    latency: number;
    reliability: number;
    score: number;
  };
  fallbackCount: number;
}

const HEALTH_WINDOW_MINUTES = 10;
const HEALTH_MIN_SAMPLES = 3;
const DEFAULT_MAX_LATENCY_MS = 5000;
const DEFAULT_MIN_RELIABILITY = 0.9;
const MAX_FAILOVER_ATTEMPTS = 2;

const WEIGHT_COST = 0.6;
const WEIGHT_LATENCY = 0.25;
const WEIGHT_RELIABILITY = 0.15;

const PROVIDER_HEALTH_CACHE_TTL = 30;

interface ProviderHealthSnapshot {
  avgLatencyMs: number;
  successRate: number;
  sampleCount: number;
  lastErrorAt?: string;
  lastError?: string;
}

async function getProviderHealthFromRedis(providerName: string): Promise<ProviderHealthSnapshot | null> {
  try {
    const raw = await cache.getGlobal('provider-health', providerName);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function recordProviderOutcome(
  providerName: string,
  success: boolean,
  latencyMs: number,
  error?: string,
): Promise<void> {
  const key = `provider-health:${providerName}`;
  try {
    const existing = await getProviderHealthFromRedis(providerName);
    const sampleCount = (existing?.sampleCount ?? 0) + 1;
    const alpha = 0.3;
    const avgLatencyMs = existing
      ? existing.avgLatencyMs * (1 - alpha) + latencyMs * alpha
      : latencyMs;
    const successRate = existing
      ? existing.successRate * (1 - alpha) + (success ? 1 : 0) * alpha
      : success ? 1 : 0;

    const snapshot: ProviderHealthSnapshot = {
      avgLatencyMs,
      successRate,
      sampleCount,
      ...(error ? { lastErrorAt: new Date().toISOString(), lastError: error } : {}),
    };

    await cache.setGlobal('provider-health', providerName, JSON.stringify(snapshot), PROVIDER_HEALTH_CACHE_TTL);
  } catch (err) {
    logger.warn({ err, providerName }, 'Failed to record provider outcome in cache');
  }
}

async function buildCandidates(workloadType: WorkloadType): Promise<ProviderCandidate[]> {
  const cacheKey = `provider-candidates:${workloadType}`;
  const cached = await cache.getGlobal('provider-candidates', workloadType);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch { }
  }

  const providers = await db
    .select()
    .from(providerRegistry)
    .where(
      and(
        eq(providerRegistry.providerType, workloadType),
        eq(providerRegistry.isActive, true),
      ),
    );

  const candidates: ProviderCandidate[] = [];

  for (const p of providers) {
    const [pricing] = await db
      .select()
      .from(providerPricing)
      .where(eq(providerPricing.providerId, p.id))
      .limit(1);

    const health = await getProviderHealthFromRedis(p.name);

    candidates.push({
      id: p.id,
      name: p.name,
      providerType: p.providerType,
      priorityOrder: p.priorityOrder ?? 0,
      costPer1k: pricing
        ? Number(pricing.inputCostPer1k ?? 0) + Number(pricing.outputCostPer1k ?? 0)
        : 999,
      avgLatencyMs: health?.avgLatencyMs ?? 500,
      reliability: health?.successRate ?? 1.0,
      isHealthy: health ? health.successRate > 0.5 : true,
    });
  }

  await cache.setGlobal('provider-candidates', workloadType, JSON.stringify(candidates), 60);

  return candidates;
}

function qualifyProviders(
  candidates: ProviderCandidate[],
  request: SelectionRequest,
): ProviderCandidate[] {
  const maxLatency = request.maxLatencyMs ?? DEFAULT_MAX_LATENCY_MS;
  const minReliability = request.minReliability ?? DEFAULT_MIN_RELIABILITY;

  return candidates.filter((c) => {
    if (!c.isHealthy) return false;
    if (c.reliability < minReliability) return false;
    if (c.avgLatencyMs > maxLatency) return false;
    return true;
  });
}

function scoreProviders(candidates: ProviderCandidate[]): Array<ProviderCandidate & { score: number }> {
  if (candidates.length === 0) return [];

  const maxCost = Math.max(...candidates.map((c) => c.costPer1k), 0.01);
  const maxLatency = Math.max(...candidates.map((c) => c.avgLatencyMs), 1);

  return candidates
    .map((c) => {
      const costScore = 1 - c.costPer1k / maxCost;
      const latencyScore = 1 - c.avgLatencyMs / maxLatency;
      const reliabilityScore = c.reliability;

      const score =
        WEIGHT_COST * costScore +
        WEIGHT_LATENCY * latencyScore +
        WEIGHT_RELIABILITY * reliabilityScore;

      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}

export async function selectProvider(request: SelectionRequest): Promise<SelectionResult> {
  const candidates = await buildCandidates(request.workloadType);
  const qualified = qualifyProviders(candidates, request);

  if (qualified.length === 0) {
    const relaxed = candidates.filter((c) => c.isHealthy);
    if (relaxed.length === 0) {
      throw new AllProvidersFailedError(request.workloadType);
    }
    const scored = scoreProviders(relaxed);
    logger.warn(
      { workloadType: request.workloadType, degraded: true, selected: scored[0].name },
      'No fully qualified providers, using degraded selection',
    );
    return {
      providerId: scored[0].id,
      providerName: scored[0].name,
      selectionReason: {
        cost: scored[0].costPer1k,
        latency: scored[0].avgLatencyMs,
        reliability: scored[0].reliability,
        score: scored[0].score,
      },
      fallbackCount: 0,
    };
  }

  const scored = scoreProviders(qualified);
  return {
    providerId: scored[0].id,
    providerName: scored[0].name,
    selectionReason: {
      cost: scored[0].costPer1k,
      latency: scored[0].avgLatencyMs,
      reliability: scored[0].reliability,
      score: scored[0].score,
    },
    fallbackCount: 0,
  };
}

export async function executeLlmWithFailover(
  request: SelectionRequest & { llmRequest: LlmRequest },
): Promise<LlmResponse & { selectionResult: SelectionResult }> {
  const candidates = await buildCandidates('llm');
  const qualified = qualifyProviders(candidates, request);
  const scored = scoreProviders(qualified.length > 0 ? qualified : candidates.filter((c) => c.isHealthy));

  if (scored.length === 0) {
    throw new AllProvidersFailedError('llm');
  }

  let lastError: Error | null = null;
  const maxAttempts = Math.min(scored.length, MAX_FAILOVER_ATTEMPTS + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = scored[attempt];
    const adapter = getLlmAdapter(candidate.name);

    try {
      logger.info(
        { provider: candidate.name, attempt, tenantId: request.tenantId },
        'Executing LLM request',
      );

      const response = await adapter.chat(request.llmRequest);

      await recordProviderOutcome(candidate.name, true, response.latencyMs);

      return {
        ...response,
        selectionResult: {
          providerId: candidate.id,
          providerName: candidate.name,
          selectionReason: {
            cost: candidate.costPer1k,
            latency: candidate.avgLatencyMs,
            reliability: candidate.reliability,
            score: candidate.score,
          },
          fallbackCount: attempt,
        },
      };
    } catch (error) {
      lastError = error as Error;
      const latency = (error as any).latencyMs ?? 0;
      await recordProviderOutcome(candidate.name, false, latency, (error as Error).message);

      logger.warn(
        { provider: candidate.name, attempt, err: error, tenantId: request.tenantId },
        'LLM provider failed, attempting failover',
      );
    }
  }

  throw new AllProvidersFailedError('llm', lastError?.message);
}

export async function executeSttWithFailover(
  request: SelectionRequest & { sttRequest: SttRequest },
): Promise<SttResponse & { selectionResult: SelectionResult }> {
  const candidates = await buildCandidates('stt');
  const qualified = qualifyProviders(candidates, request);
  const scored = scoreProviders(qualified.length > 0 ? qualified : candidates.filter((c) => c.isHealthy));

  if (scored.length === 0) {
    throw new AllProvidersFailedError('stt');
  }

  let lastError: Error | null = null;
  const maxAttempts = Math.min(scored.length, MAX_FAILOVER_ATTEMPTS + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = scored[attempt];
    const adapter = getSttAdapter(candidate.name);

    try {
      const response = await adapter.transcribe(request.sttRequest);
      await recordProviderOutcome(candidate.name, true, response.latencyMs);

      return {
        ...response,
        selectionResult: {
          providerId: candidate.id,
          providerName: candidate.name,
          selectionReason: {
            cost: candidate.costPer1k,
            latency: candidate.avgLatencyMs,
            reliability: candidate.reliability,
            score: candidate.score,
          },
          fallbackCount: attempt,
        },
      };
    } catch (error) {
      lastError = error as Error;
      await recordProviderOutcome(candidate.name, false, 0, (error as Error).message);

      logger.warn(
        { provider: candidate.name, attempt, err: error },
        'STT provider failed, attempting failover',
      );
    }
  }

  throw new AllProvidersFailedError('stt', lastError?.message);
}

export async function executeTtsWithFailover(
  request: SelectionRequest & { ttsRequest: TtsRequest },
): Promise<TtsResponse & { selectionResult: SelectionResult }> {
  const candidates = await buildCandidates('tts');
  const qualified = qualifyProviders(candidates, request);
  const scored = scoreProviders(qualified.length > 0 ? qualified : candidates.filter((c) => c.isHealthy));

  if (scored.length === 0) {
    throw new AllProvidersFailedError('tts');
  }

  let lastError: Error | null = null;
  const maxAttempts = Math.min(scored.length, MAX_FAILOVER_ATTEMPTS + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = scored[attempt];
    const adapter = getTtsAdapter(candidate.name);

    try {
      const response = await adapter.synthesize(request.ttsRequest);
      await recordProviderOutcome(candidate.name, true, response.latencyMs);

      return {
        ...response,
        selectionResult: {
          providerId: candidate.id,
          providerName: candidate.name,
          selectionReason: {
            cost: candidate.costPer1k,
            latency: candidate.avgLatencyMs,
            reliability: candidate.reliability,
            score: candidate.score,
          },
          fallbackCount: attempt,
        },
      };
    } catch (error) {
      lastError = error as Error;
      await recordProviderOutcome(candidate.name, false, 0, (error as Error).message);

      logger.warn(
        { provider: candidate.name, attempt, err: error },
        'TTS provider failed, attempting failover',
      );
    }
  }

  throw new AllProvidersFailedError('tts', lastError?.message);
}
