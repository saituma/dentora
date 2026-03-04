
import type { Request, Response, NextFunction } from 'express';
import { resolveApiKey, type ResolvedApiKey } from '../modules/api-keys/api-key.service.js';
import { InvalidProviderError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Extends Express Request to carry the resolved provider key context.
 * The resolved key is attached to req.providerKeyContext and available
 * to downstream handlers. The raw API key is intentionally not logged
 * or exposed in any response.
 */
declare global {
  namespace Express {
    interface Request {
      providerKeyContext?: ProviderKeyContext;
    }
  }
}

export interface ProviderKeyContext {
  apiKey: string;
  provider: string;
  resolvedVia: 'tenant' | 'platform';
  keyHint: string;
}

/**
 * Middleware factory that resolves the provider API key for the current request.
 *
 * Provider name is extracted from:
 * 1. req.body.provider (for POST requests)
 * 2. req.query.provider (for GET requests)
 *
 * Requires tenantContext to be set on the request (i.e., must run after tenant resolution).
 */
export function resolveProviderKey() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = (req.body?.provider || req.query?.provider) as string | undefined;

      if (!provider) {
        next(new InvalidProviderError('(not provided)'));
        return;
      }

      const tenantId = req.tenantContext?.tenantId;
      if (!tenantId) {
        next(new Error('Tenant context required before provider key resolution'));
        return;
      }

      const resolved: ResolvedApiKey = await resolveApiKey(tenantId, provider);

      req.providerKeyContext = {
        apiKey: resolved.apiKey,
        provider: resolved.provider,
        resolvedVia: resolved.resolvedVia,
        keyHint: resolved.keyHint,
      };

      logger.info(
        {
          tenantId,
          provider: resolved.provider,
          resolvedVia: resolved.resolvedVia,
          keyHint: resolved.keyHint,
        },
        'Provider key resolved for request',
      );

      next();
    } catch (error) {
      next(error);
    }
  };
}
