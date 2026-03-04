
import { db } from '../../db/index.js';
import { tenantApiKeys } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { encrypt, decrypt, maskApiKey } from '../../lib/encryption.js';
import { tenantCacheGet, tenantCacheSet, tenantCacheDel } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import {
  MissingProviderKeyError,
  InvalidProviderError,
  NotFoundError,
  ConflictError,
} from '../../lib/errors.js';
import { generateId } from '../../lib/crypto.js';

/**
 * Valid provider names that can have API keys configured.
 * Acts as a server-side whitelist independent of shared enums.
 */
const VALID_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'deepgram',
  'elevenlabs',
  'google-stt',
  'google-tts',
] as const);

type ValidProvider = 'openai' | 'anthropic' | 'deepgram' | 'elevenlabs' | 'google-stt' | 'google-tts';

/**
 * Maps provider names to their corresponding platform-level environment variable keys.
 * These are the fallback keys used when no tenant-specific key exists.
 */
const PLATFORM_KEY_MAP: Record<ValidProvider, keyof typeof env> = {
  'openai': 'OPENAI_API_KEY',
  'anthropic': 'ANTHROPIC_API_KEY',
  'deepgram': 'DEEPGRAM_API_KEY',
  'elevenlabs': 'ELEVENLABS_API_KEY',
  'google-stt': 'GOOGLE_AI_API_KEY',
  'google-tts': 'GOOGLE_TTS_API_KEY',
};

const CACHE_TTL_RESOLVED_KEY = 300; // 5 minutes
const CACHE_DOMAIN = 'provider-key';

export interface ResolvedApiKey {
  apiKey: string;
  resolvedVia: 'tenant' | 'platform';
  provider: ValidProvider;
  keyHint: string;
}

/**
 * Core resolution function implementing the priority chain:
 * 1. Tenant-specific encrypted key (if exists and active)
 * 2. Platform-level env key
 * 3. Throw MissingProviderKeyError
 *
 * The resolved key is cached per-tenant per-provider to avoid
 * repeated DB lookups + decryption on every request.
 */
export async function resolveApiKey(
  tenantId: string,
  provider: string,
): Promise<ResolvedApiKey> {
  if (!VALID_PROVIDERS.has(provider as ValidProvider)) {
    throw new InvalidProviderError(provider);
  }

  const validProvider = provider as ValidProvider;

  // Check cache first
  const cached = await tenantCacheGet<ResolvedApiKey>(tenantId, CACHE_DOMAIN, validProvider);
  if (cached) {
    logger.debug(
      { tenantId, provider: validProvider, resolvedVia: cached.resolvedVia },
      'API key resolved from cache',
    );
    return cached;
  }

  // 1. Try tenant-specific key
  const [tenantKey] = await db
    .select({
      encryptedKey: tenantApiKeys.encryptedKey,
      keyHint: tenantApiKeys.keyHint,
      expiresAt: tenantApiKeys.expiresAt,
    })
    .from(tenantApiKeys)
    .where(
      and(
        eq(tenantApiKeys.tenantId, tenantId),
        eq(tenantApiKeys.providerName, validProvider),
        eq(tenantApiKeys.status, 'active'),
      ),
    )
    .limit(1);

  if (tenantKey) {
    // Check expiry
    if (tenantKey.expiresAt && new Date(tenantKey.expiresAt) < new Date()) {
      logger.warn(
        { tenantId, provider: validProvider },
        'Tenant API key expired, falling through to platform key',
      );
    } else {
      const apiKey = decrypt(tenantKey.encryptedKey);
      const resolved: ResolvedApiKey = {
        apiKey,
        resolvedVia: 'tenant',
        provider: validProvider,
        keyHint: tenantKey.keyHint,
      };

      await tenantCacheSet(tenantId, CACHE_DOMAIN, validProvider, resolved, CACHE_TTL_RESOLVED_KEY);

      logger.info(
        { tenantId, provider: validProvider, resolvedVia: 'tenant', keyHint: tenantKey.keyHint },
        'API key resolved via tenant override',
      );

      // Fire-and-forget: update lastUsedAt
      db.update(tenantApiKeys)
        .set({ lastUsedAt: new Date() })
        .where(
          and(
            eq(tenantApiKeys.tenantId, tenantId),
            eq(tenantApiKeys.providerName, validProvider),
            eq(tenantApiKeys.status, 'active'),
          ),
        )
        .catch((err) => logger.warn({ err }, 'Failed to update lastUsedAt'));

      return resolved;
    }
  }

  // 2. Try platform-level env key
  const envKey = PLATFORM_KEY_MAP[validProvider];
  const platformKey = env[envKey] as string;

  if (platformKey && platformKey.length > 0) {
    const resolved: ResolvedApiKey = {
      apiKey: platformKey,
      resolvedVia: 'platform',
      provider: validProvider,
      keyHint: maskApiKey(platformKey),
    };

    await tenantCacheSet(tenantId, CACHE_DOMAIN, validProvider, resolved, CACHE_TTL_RESOLVED_KEY);

    logger.info(
      { tenantId, provider: validProvider, resolvedVia: 'platform' },
      'API key resolved via platform fallback',
    );

    return resolved;
  }

  // 3. No key available
  throw new MissingProviderKeyError(validProvider, tenantId);
}

/**
 * Validates a provider name against the whitelist.
 */
export function isValidProvider(provider: string): provider is ValidProvider {
  return VALID_PROVIDERS.has(provider as ValidProvider);
}

/**
 * Returns the list of valid provider names.
 */
export function getValidProviders(): string[] {
  return [...VALID_PROVIDERS];
}

// ─── Tenant API Key CRUD ────────────────────────────────────────────────────

export interface StoreTenantKeyInput {
  tenantId: string;
  provider: string;
  apiKey: string;
  label?: string;
  expiresAt?: Date;
  createdBy: string;
}

/**
 * Stores a tenant-specific API key. Encrypts the key before storage.
 * If an active key already exists for this tenant+provider, it revokes the old one.
 */
export async function storeTenantApiKey(input: StoreTenantKeyInput): Promise<{
  id: string;
  provider: string;
  keyHint: string;
  status: string;
}> {
  if (!isValidProvider(input.provider)) {
    throw new InvalidProviderError(input.provider);
  }

  const encryptedKey = encrypt(input.apiKey);
  const keyHint = maskApiKey(input.apiKey);

  // Revoke any existing active key for this tenant+provider
  await db
    .update(tenantApiKeys)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(
      and(
        eq(tenantApiKeys.tenantId, input.tenantId),
        eq(tenantApiKeys.providerName, input.provider as ValidProvider),
        eq(tenantApiKeys.status, 'active'),
      ),
    );

  const id = generateId();

  await db.insert(tenantApiKeys).values({
    id,
    tenantId: input.tenantId,
    providerName: input.provider as ValidProvider,
    encryptedKey,
    keyHint,
    status: 'active',
    label: input.label,
    createdBy: input.createdBy,
    expiresAt: input.expiresAt,
  });

  // Invalidate cache
  await tenantCacheDel(input.tenantId, CACHE_DOMAIN, input.provider);

  logger.info(
    { tenantId: input.tenantId, provider: input.provider, keyHint },
    'Tenant API key stored',
  );

  return { id, provider: input.provider, keyHint, status: 'active' };
}

/**
 * Revokes a tenant's API key for a specific provider.
 */
export async function revokeTenantApiKey(
  tenantId: string,
  provider: string,
): Promise<void> {
  if (!isValidProvider(provider)) {
    throw new InvalidProviderError(provider);
  }

  const result = await db
    .update(tenantApiKeys)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(
      and(
        eq(tenantApiKeys.tenantId, tenantId),
        eq(tenantApiKeys.providerName, provider as ValidProvider),
        eq(tenantApiKeys.status, 'active'),
      ),
    )
    .returning({ id: tenantApiKeys.id });

  if (result.length === 0) {
    throw new NotFoundError('API key', `${tenantId}/${provider}`);
  }

  // Invalidate cache
  await tenantCacheDel(tenantId, CACHE_DOMAIN, provider);

  logger.info({ tenantId, provider }, 'Tenant API key revoked');
}

/**
 * Lists all API keys for a tenant (without exposing decrypted values).
 */
export async function listTenantApiKeys(tenantId: string): Promise<Array<{
  id: string;
  provider: string;
  keyHint: string;
  status: string;
  label: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}>> {
  const keys = await db
    .select({
      id: tenantApiKeys.id,
      provider: tenantApiKeys.providerName,
      keyHint: tenantApiKeys.keyHint,
      status: tenantApiKeys.status,
      label: tenantApiKeys.label,
      lastUsedAt: tenantApiKeys.lastUsedAt,
      expiresAt: tenantApiKeys.expiresAt,
      createdAt: tenantApiKeys.createdAt,
    })
    .from(tenantApiKeys)
    .where(eq(tenantApiKeys.tenantId, tenantId))
    .orderBy(tenantApiKeys.createdAt);

  return keys;
}
