
import { logger } from '../../lib/logger.js';
import { InvalidProviderError, ProviderError } from '../../lib/errors.js';
import { getLlmAdapter } from '../ai/providers/index.js';
import type { LlmMessage, LlmResponse } from '../ai/providers/base.js';
import { writeAuditLog } from '../../middleware/audit.js';
import { maskApiKey } from '../../lib/encryption.js';

export interface ExecuteLlmInput {
  provider: string;
  apiKey: string;
  payload: {
    model?: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
  };
  tenantId: string;
  userId: string;
  task: string;
}

export interface ExecuteLlmResult {
  response: string;
  model: string;
  provider: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs: number;
  finishReason: string;
}

/**
 * Core LLM execution function.
 * Accepts a fully resolved API key (never reads from env directly).
 * This is the single point where provider API keys are used.
 *
 * Security invariants:
 * - API key is never logged raw (masked in audit)
 * - API key is never returned in the response
 * - Provider is validated against adapter registry
 */
export async function executeLlm(input: ExecuteLlmInput): Promise<ExecuteLlmResult> {
  const { provider, apiKey, payload, tenantId, userId, task } = input;

  // Validate provider has an adapter registered
  let adapter;
  try {
    adapter = getLlmAdapter(provider);
  } catch {
    throw new InvalidProviderError(provider);
  }

  const messages: LlmMessage[] = payload.messages.map((m) => ({
    role: m.role as LlmMessage['role'],
    content: m.content,
  }));

  logger.info(
    {
      tenantId,
      provider,
      task,
      model: payload.model,
      messageCount: messages.length,
    },
    'Executing LLM request',
  );

  const start = Date.now();

  let response: LlmResponse;
  try {
    response = await adapter.chat({
      model: payload.model || 'gpt-4o-mini',
      messages,
      maxTokens: payload.maxTokens,
      temperature: payload.temperature,
      tenantId,
      apiKey,
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    logger.error(
      {
        tenantId,
        provider,
        task,
        latencyMs,
        err: error,
      },
      'LLM execution failed',
    );
    throw error;
  }

  const latencyMs = Date.now() - start;

  // Audit log the usage (key is masked, never raw)
  writeAuditLog({
    tenantId,
    actorId: userId,
    actorType: 'user',
    action: 'llm.execute',
    entityType: 'llm_request',
    metadata: {
      provider,
      task,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs,
      keyHint: maskApiKey(apiKey),
      finishReason: response.finishReason,
    },
  });

  logger.info(
    {
      tenantId,
      provider,
      task,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs,
      finishReason: response.finishReason,
    },
    'LLM execution completed',
  );

  return {
    response: response.content,
    model: response.model,
    provider: response.provider,
    usage: {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    },
    latencyMs,
    finishReason: response.finishReason,
  };
}
