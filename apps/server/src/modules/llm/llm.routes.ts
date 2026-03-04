
import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate } from '../../middleware/index.js';
import { resolveProviderKey } from '../../middleware/providerKey.js';
import { rateLimiter } from '../../middleware/rateLimit.js';
import { executeLlm } from './llm.service.js';

/**
 * Tenant-scoped LLM rate limiter.
 * 100 requests per 60 seconds per tenant — stricter than the general API limit
 * because LLM calls are expensive and latency-sensitive.
 */
const llmRateLimiter = rateLimiter({
  maxRequests: 100,
  windowSeconds: 60,
  keyPrefix: 'llm',
});

const VALID_PROVIDERS = ['openai', 'anthropic'] as const;
const VALID_TASKS = ['generate_response', 'summarize', 'extract_intent'] as const;

const executeLlmSchema = z.object({
  provider: z.enum(VALID_PROVIDERS, {
    error: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}`,
  }),
  task: z.enum(VALID_TASKS, {
    error: `Task must be one of: ${VALID_TASKS.join(', ')}`,
  }),
  payload: z.object({
    model: z.string().min(1).max(100).optional(),
    messages: z.array(z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string().min(1).max(32000),
    })).min(1).max(100),
    maxTokens: z.number().int().min(1).max(4096).optional(),
    temperature: z.number().min(0).max(2).optional(),
  }),
});

export const llmRouter = Router();

/**
 * POST /api/llm/execute
 *
 * End-to-end flow:
 * Client → Auth (JWT) → Tenant Resolution → Provider Key Resolution → LLM Execution → Response
 *
 * The client sends:
 *   { provider: "openai", task: "generate_response", payload: { messages: [...] } }
 *
 * The client NEVER sends an API key. The key is resolved server-side via:
 *   1. Tenant-specific encrypted key (if configured)
 *   2. Platform-level env fallback
 *   3. 422 MISSING_PROVIDER_KEY error
 */
llmRouter.post(
  '/execute',
  authenticateJwt,
  resolveTenant,
  llmRateLimiter,
  validate({ body: executeLlmSchema }),
  resolveProviderKey(),
  async (req, res, next) => {
    try {
      const { task, payload } = req.body;
      const tenantId = req.tenantContext!.tenantId;
      const userId = req.user!.userId;
      const providerKey = req.providerKeyContext!;

      const result = await executeLlm({
        provider: providerKey.provider,
        apiKey: providerKey.apiKey,
        payload,
        tenantId,
        userId,
        task,
      });

      // Audit the request
      req.audit?.({
        action: 'llm.execute',
        entityType: 'llm_request',
        afterState: {
          provider: result.provider,
          task,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          latencyMs: result.latencyMs,
          keyResolvedVia: providerKey.resolvedVia,
        },
      });

      // Response: NEVER includes the API key
      res.json({
        data: {
          response: result.response,
          model: result.model,
          provider: result.provider,
          usage: result.usage,
          latencyMs: result.latencyMs,
          finishReason: result.finishReason,
        },
        meta: {
          task,
          keyResolvedVia: providerKey.resolvedVia,
          correlationId: req.tenantContext!.correlationId,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/llm/providers
 *
 * Returns the list of available LLM providers.
 * Used by the client to populate provider selection dropdowns.
 */
llmRouter.get(
  '/providers',
  authenticateJwt,
  resolveTenant,
  (_req, res) => {
    res.json({
      data: {
        providers: [...VALID_PROVIDERS],
        tasks: [...VALID_TASKS],
      },
    });
  },
);
