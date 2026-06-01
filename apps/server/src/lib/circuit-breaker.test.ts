import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  withCircuitBreaker,
  getCircuitBreakerStatus,
  CircuitBreakerOpenError,
  resetCircuitBreaker,
} from './circuit-breaker.js';

// Each test uses a unique breaker name because breaker state lives in a module-level map.
let counter = 0;
const uniqueName = (): string => `test-breaker-${counter++}`;

const trip = async (name: string): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await expect(withCircuitBreaker(name, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
  }
};

describe('circuit breaker self-heal reporting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('opens after the failure threshold', async () => {
    const name = uniqueName();
    await trip(name);
    expect(getCircuitBreakerStatus()[name]?.state).toBe('open');
  });

  it('reports half-open once the reset window elapses, even with no traffic', async () => {
    const name = uniqueName();
    await trip(name);
    expect(getCircuitBreakerStatus()[name]?.state).toBe('open');

    // Regression guard: the webhook gates inbound calls on this status and, while open,
    // suppresses the very traffic that would probe the breaker. If the status never
    // ages out of 'open' on its own, every call diverts to robotic voicemail forever.
    vi.advanceTimersByTime(30_000);
    expect(getCircuitBreakerStatus()[name]?.state).toBe('half-open');

    await resetCircuitBreaker(name);
  });

  it('still rejects calls in-band before the reset window elapses', async () => {
    const name = uniqueName();
    await trip(name);

    vi.advanceTimersByTime(10_000);
    await expect(withCircuitBreaker(name, () => Promise.resolve('ok'))).rejects.toBeInstanceOf(
      CircuitBreakerOpenError,
    );

    await resetCircuitBreaker(name);
  });

  it('closes again when a probe succeeds after the reset window', async () => {
    const name = uniqueName();
    await trip(name);

    vi.advanceTimersByTime(30_000);
    await expect(withCircuitBreaker(name, () => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(getCircuitBreakerStatus()[name]?.state).toBe('closed');
  });
});
