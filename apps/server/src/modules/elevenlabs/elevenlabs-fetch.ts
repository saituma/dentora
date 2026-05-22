import { withRetry } from '../../lib/retry.js';
import { withCircuitBreaker } from '../../lib/circuit-breaker.js';

/**
 * fetch() for the ElevenLabs API, wrapped in retry + a shared circuit breaker.
 *
 * Transient failures (network errors, 429, 5xx) are retried with backoff; a
 * sustained ElevenLabs outage trips the 'elevenlabs' breaker so subsequent
 * calls fast-fail instead of hanging every call setup. 4xx responses are
 * returned as-is for the caller to handle — they are client errors, not an
 * ElevenLabs outage, so they neither retry nor count against the breaker.
 */
export async function elevenLabsFetch(url: string, init?: RequestInit): Promise<Response> {
  return withCircuitBreaker('elevenlabs', () =>
    withRetry(async () => {
      const response = await fetch(url, init);
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`ElevenLabs API ${response.status}`);
      }
      return response;
    }),
  );
}
