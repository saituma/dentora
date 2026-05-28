import { logger } from './logger.js';
import { circuitBreakerOpenTotal, circuitBreakerRejectedTotal } from './metrics.js';
import { getRedis, globalCacheSet } from './cache.js';

type CBState = 'closed' | 'open' | 'half-open';

interface Breaker {
  state: CBState;
  failures: number;
  lastFailureAt: number;
  halfOpenAt: number;
}

const breakers = new Map<string, Breaker>();

const FAILURE_THRESHOLD = 5; // open after this many consecutive failures
const RESET_TIMEOUT_MS = 30_000; // stay open for 30 s then go half-open

const DYNO = process.env.DYNO ?? 'local';
const SHARED_DOMAIN = 'circuit-breaker';
const SHARED_TTL_S = 90; // refreshed on every transition; expires if a dyno goes quiet

interface SharedBreaker {
  state: CBState;
  failures: number;
  lastFailureAt: number;
  dyno: string;
}

// Fire-and-forget — breaker logic stays synchronous; Redis is best-effort and
// must never throw into the hot path (getRedis can throw before init).
function persistBreaker(name: string, b: Breaker): void {
  try {
    globalCacheSet(
      SHARED_DOMAIN,
      name,
      { state: b.state, failures: b.failures, lastFailureAt: b.lastFailureAt, dyno: DYNO },
      SHARED_TTL_S,
    ).catch(() => undefined);
  } catch {
    /* Redis not ready — skip */
  }
}

function getBreaker(name: string): Breaker {
  let b = breakers.get(name);
  if (!b) {
    b = { state: 'closed', failures: 0, lastFailureAt: 0, halfOpenAt: 0 };
    breakers.set(name, b);
  }
  return b;
}

function onSuccess(name: string, b: Breaker): void {
  if (b.state !== 'closed' || b.failures > 0) {
    logger.info({ service: name }, 'Circuit breaker reset to closed');
    b.state = 'closed';
    b.failures = 0;
    persistBreaker(name, b);
    return;
  }
  b.state = 'closed';
  b.failures = 0;
}

function onFailure(name: string, b: Breaker, err: unknown): void {
  b.failures += 1;
  b.lastFailureAt = Date.now();

  if (b.failures >= FAILURE_THRESHOLD && b.state === 'closed') {
    b.state = 'open';
    b.halfOpenAt = Date.now() + RESET_TIMEOUT_MS;
    logger.error({ service: name, failures: b.failures, err }, 'Circuit breaker opened');
    circuitBreakerOpenTotal.inc({ service: name });
  } else if (b.state === 'half-open') {
    b.state = 'open';
    b.halfOpenAt = Date.now() + RESET_TIMEOUT_MS;
    logger.warn({ service: name }, 'Circuit breaker back to open after half-open failure');
  }
  persistBreaker(name, b);
}

export class CircuitBreakerOpenError extends Error {
  constructor(service: string) {
    super(`Circuit breaker open for ${service} — requests temporarily rejected`);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Wraps an async function with a named circuit breaker.
 * - Closed: requests pass through normally.
 * - Open: requests immediately throw CircuitBreakerOpenError.
 * - Half-open: one probe request allowed; success resets, failure reopens.
 */
export async function withCircuitBreaker<T>(serviceName: string, fn: () => Promise<T>): Promise<T> {
  const b = getBreaker(serviceName);
  const now = Date.now();

  if (b.state === 'open') {
    if (now >= b.halfOpenAt) {
      b.state = 'half-open';
      logger.info({ service: serviceName }, 'Circuit breaker half-open: probing');
      persistBreaker(serviceName, b);
    } else {
      circuitBreakerRejectedTotal.inc({ service: serviceName });
      throw new CircuitBreakerOpenError(serviceName);
    }
  }

  try {
    const result = await fn();
    onSuccess(serviceName, b);
    return result;
  } catch (err) {
    onFailure(serviceName, b, err);
    throw err;
  }
}

/** Returns a snapshot of this dyno's breaker states for health/metrics endpoints. */
export function getCircuitBreakerStatus(): Record<string, { state: CBState; failures: number }> {
  const out: Record<string, { state: CBState; failures: number }> = {};
  for (const [name, b] of breakers) {
    out[name] = { state: b.state, failures: b.failures };
  }
  return out;
}

const STATE_SEVERITY: Record<CBState, number> = { closed: 0, 'half-open': 1, open: 2 };

/**
 * Cross-dyno breaker view. Merges this process's in-memory breakers with the
 * snapshots every dyno writes to Redis on each transition, surfacing the most
 * degraded state per breaker so an open breaker on any dyno is always visible.
 */
export async function getCircuitBreakerStatusShared(): Promise<
  Record<string, { state: CBState; failures: number; dyno?: string }>
> {
  const out: Record<string, { state: CBState; failures: number; dyno?: string }> = {};

  for (const [name, b] of breakers) {
    out[name] = { state: b.state, failures: b.failures, dyno: DYNO };
  }

  try {
    const redis = getRedis();
    const keys = await redis.keys(`global:${SHARED_DOMAIN}:*`);
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const s = JSON.parse(raw) as SharedBreaker;
      const name = key.replace(`global:${SHARED_DOMAIN}:`, '');
      const existing = out[name];
      if (!existing || STATE_SEVERITY[s.state] > STATE_SEVERITY[existing.state]) {
        out[name] = { state: s.state, failures: s.failures, dyno: s.dyno };
      }
    }
  } catch {
    /* Redis unavailable — fall back to local-only view */
  }

  return out;
}
