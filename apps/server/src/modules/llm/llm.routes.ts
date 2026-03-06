
import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate } from '../../middleware/index.js';
import { resolveProviderKey } from '../../middleware/providerKey.js';
import { rateLimiter } from '../../middleware/rateLimit.js';
import { executeLlm, streamLlm } from './llm.service.js';
import { buildReceptionistSystemPrompt, loadLiveTenantAIContext } from '../ai/ai.service.js';
import { resolveApiKey } from '../api-keys/api-key.service.js';

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

const VALID_PROVIDERS = ['openai'] as const;
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

const receptionistStreamSchema = z.object({
  provider: z.literal('openai').default('openai'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(32000),
  })).max(100).default([]),
  userMessage: z.string().min(1).max(2000),
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

llmRouter.post(
  '/receptionist-test/stream',
  authenticateJwt,
  resolveTenant,
  llmRateLimiter,
  validate({ body: receptionistStreamSchema }),
  async (req, res, next) => {
    const abortController = new AbortController();

    req.on('close', () => {
      abortController.abort(new Error('Client disconnected'));
    });

    try {
      const tenantId = req.tenantContext!.tenantId;
      const userId = req.user!.userId;
      const providerKey = await resolveApiKey(tenantId, 'openai');
      const aiContext = await loadLiveTenantAIContext(
        tenantId,
        req.tenantContext!.activeConfigVersion,
      );
      const systemPrompt = buildReceptionistSystemPrompt(aiContext, 'sidebar-test');

      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...req.body.conversationHistory,
        {
          role: 'user' as const,
          content: `User Speaking Live: ${req.body.userMessage}\n\nRespond naturally, concisely, and ready for immediate spoken output.`,
        },
      ];

      const result = await streamLlm({
        provider: providerKey.provider,
        apiKey: providerKey.apiKey,
        tenantId,
        userId,
        task: 'generate_response',
        abortSignal: abortController.signal,
        payload: {
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.5,
          maxTokens: 150,
        },
        onDelta: (delta) => {
          res.write(`event: chunk\n`);
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        },
      });

      req.audit?.({
        action: 'llm.receptionist_stream',
        entityType: 'llm_request',
        afterState: {
          provider: result.provider,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          latencyMs: result.latencyMs,
          keyResolvedVia: providerKey.resolvedVia,
          streaming: true,
        },
      });

      res.write(`event: done\n`);
      res.write(`data: ${JSON.stringify({
        response: result.response,
        model: result.model,
        provider: result.provider,
        usage: result.usage,
        latencyMs: result.latencyMs,
        finishReason: result.finishReason,
      })}\n\n`);
      res.end();
    } catch (err) {
      if (!res.headersSent) {
        next(err);
        return;
      }

      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: err instanceof Error ? err.message : 'Streaming failed' })}\n\n`);
      res.end();
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
