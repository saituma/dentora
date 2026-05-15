import { createHash } from 'crypto';
import { uploadFile, downloadFile, isStorageConfigured } from './storage.js';
import { logger } from './logger.js';

// In-memory hot cache — avoids R2 round-trip for the most frequent phrases.
// 500 phrases × ~55KB avg = ~27MB max. Fine on a 4GB server.
const HOT_CACHE = new Map<string, Buffer>();
const HOT_CACHE_MAX = 500;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' '); // collapse whitespace
}

function buildCacheKey(normalizedText: string, voiceId: string): string {
  const hash = createHash('sha256')
    .update(`${voiceId}::${normalizedText}`)
    .digest('hex')
    .slice(0, 32);
  return `phrase-cache/${voiceId}/${hash}.mp3`;
}

function hotCacheKey(normalizedText: string, voiceId: string): string {
  return `${voiceId}::${normalizedText}`;
}

/**
 * Returns cached audio for this text+voice combination, or null on miss.
 * Checks in-memory first, then R2.
 */
export async function getCachedPhrase(text: string, voiceId: string): Promise<Buffer | null> {
  if (!isStorageConfigured()) return null;

  const normalized = normalizeText(text);
  const hotKey = hotCacheKey(normalized, voiceId);

  // 1. In-memory hit — zero latency
  if (HOT_CACHE.has(hotKey)) {
    logger.debug({ voiceId, chars: text.length }, 'Phrase cache: hot hit');
    return HOT_CACHE.get(hotKey)!;
  }

  // 2. R2 hit — ~10–30ms
  try {
    const r2Key = buildCacheKey(normalized, voiceId);
    const { body } = await downloadFile(r2Key);

    // Promote to hot cache
    if (HOT_CACHE.size >= HOT_CACHE_MAX) {
      const firstKey = HOT_CACHE.keys().next().value;
      if (firstKey) HOT_CACHE.delete(firstKey);
    }
    HOT_CACHE.set(hotKey, body);

    logger.debug({ voiceId, chars: text.length }, 'Phrase cache: R2 hit');
    return body;
  } catch {
    // 404 or R2 unavailable — treat as miss
    return null;
  }
}

/**
 * Stores generated audio in R2 and hot cache for future use.
 * Called after a TTS provider generates audio for a short phrase.
 */
export async function setCachedPhrase(text: string, voiceId: string, audio: Buffer): Promise<void> {
  if (!isStorageConfigured()) return;

  const normalized = normalizeText(text);
  const r2Key = buildCacheKey(normalized, voiceId);
  const hotKey = hotCacheKey(normalized, voiceId);

  try {
    await uploadFile({
      key: r2Key,
      body: audio,
      contentType: 'audio/mpeg',
      metadata: { voiceId, chars: String(text.length) },
    });

    if (HOT_CACHE.size >= HOT_CACHE_MAX) {
      const firstKey = HOT_CACHE.keys().next().value;
      if (firstKey) HOT_CACHE.delete(firstKey);
    }
    HOT_CACHE.set(hotKey, audio);

    logger.debug({ voiceId, r2Key }, 'Phrase cache: stored');
  } catch (err) {
    // Non-fatal — just means next call won't hit cache
    logger.warn({ err, voiceId }, 'Phrase cache: failed to store in R2');
  }
}

// Short phrase threshold — only cache replies under this length.
// Long dynamic responses (booking details, addresses) should not be cached.
export const PHRASE_CACHE_MAX_CHARS = 120;

export function isCacheable(text: string): boolean {
  return text.length <= PHRASE_CACHE_MAX_CHARS;
}
