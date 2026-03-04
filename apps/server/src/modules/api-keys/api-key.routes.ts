
import { Router } from 'express';
import { z } from 'zod';
import {
  authenticateJwt,
  resolveTenant,
  validate,
  requireRole,
  configWriteRateLimiter,
} from '../../middleware/index.js';
import * as apiKeyService from './api-key.service.js';

const VALID_PROVIDERS = [
  'openai', 'anthropic', 'deepgram', 'elevenlabs', 'google-stt', 'google-tts',
] as const;

const storeKeySchema = z.object({
  provider: z.enum(VALID_PROVIDERS, {
    error: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}`,
  }),
  apiKey: z.string().min(8).max(512),
  label: z.string().min(1).max(100).optional(),
  expiresAt: z.string().datetime().optional(),
});

const revokeKeySchema = z.object({
  provider: z.enum(VALID_PROVIDERS, {
    error: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}`,
  }),
});

export const apiKeyRouter = Router();

// All routes require auth + tenant + owner/admin role
apiKeyRouter.use(authenticateJwt, resolveTenant, requireRole('owner', 'admin'));

/**
 * GET /api/api-keys
 * Lists all API keys for the current tenant (masked, never raw).
 */
apiKeyRouter.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const keys = await apiKeyService.listTenantApiKeys(tenantId);
    res.json({ data: keys });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/api-keys
 * Stores a new tenant-specific API key (encrypted).
 * The raw key is only accepted in this request — it is never stored or returned again.
 */
apiKeyRouter.post(
  '/',
  configWriteRateLimiter,
  validate({ body: storeKeySchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const userId = req.user!.userId;

      const result = await apiKeyService.storeTenantApiKey({
        tenantId,
        provider: req.body.provider,
        apiKey: req.body.apiKey,
        label: req.body.label,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
        createdBy: userId,
      });

      req.audit?.({
        action: 'api_key.stored',
        entityType: 'tenant_api_key',
        entityId: result.id,
        afterState: {
          provider: result.provider,
          keyHint: result.keyHint,
        },
      });

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/api-keys
 * Revokes a tenant's active API key for a specific provider.
 */
apiKeyRouter.delete(
  '/',
  configWriteRateLimiter,
  validate({ body: revokeKeySchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;

      await apiKeyService.revokeTenantApiKey(tenantId, req.body.provider);

      req.audit?.({
        action: 'api_key.revoked',
        entityType: 'tenant_api_key',
        afterState: { provider: req.body.provider },
      });

      res.json({ message: 'API key revoked' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/api-keys/providers
 * Returns the list of valid provider names for key configuration.
 */
apiKeyRouter.get('/providers', (_req, res) => {
  res.json({ data: { providers: [...VALID_PROVIDERS] } });
});
