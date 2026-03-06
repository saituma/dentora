
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

export interface StreamLlmInput extends ExecuteLlmInput {
  onDelta: (delta: string) => void;
  abortSignal?: AbortSignal;
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

export async function streamLlm(input: StreamLlmInput): Promise<ExecuteLlmResult> {
  const { provider, apiKey, payload, tenantId, userId, task, onDelta, abortSignal } = input;

  if (provider !== 'openai') {
    throw new InvalidProviderError(provider);
  }

  logger.info(
    {
      tenantId,
      provider,
      task,
      model: payload.model,
      messageCount: payload.messages.length,
    },
    'Executing streaming LLM request',
  );

  const start = Date.now();
  const model = payload.model || 'gpt-4o-mini';
  const upstreamController = new AbortController();
  const onAbort = () => upstreamController.abort(abortSignal?.reason);
  abortSignal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(process.env.OPENAI_ORG_ID ? { 'OpenAI-Organization': process.env.OPENAI_ORG_ID } : {}),
      },
      body: JSON.stringify({
        model,
        messages: payload.messages,
        max_tokens: payload.maxTokens ?? 512,
        temperature: payload.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: upstreamController.signal,
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.text();
      throw new ProviderError(
        `OpenAI API error: ${response.status} ${errorBody}`,
        provider,
        response.status,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason = 'stop';

    const processEventBlock = (block: string) => {
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      for (const dataLine of dataLines) {
        if (dataLine === '[DONE]') return;

        const parsed = JSON.parse(dataLine) as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
          };
          model?: string;
        };

        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          fullResponse += delta;
          onDelta(delta);
        }

        if (parsed.usage) {
          inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
          outputTokens = parsed.usage.completion_tokens ?? outputTokens;
        }

        if (parsed.choices?.[0]?.finish_reason) {
          finishReason = parsed.choices[0].finish_reason ?? finishReason;
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundaryIndex = buffer.indexOf('\n\n');
        if (boundaryIndex === -1) break;

        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        if (!block.trim()) continue;
        processEventBlock(block);
      }
    }

    if (buffer.trim()) {
      processEventBlock(buffer);
    }

    const latencyMs = Date.now() - start;

    writeAuditLog({
      tenantId,
      actorId: userId,
      actorType: 'user',
      action: 'llm.execute',
      entityType: 'llm_request',
      metadata: {
        provider,
        task,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        keyHint: maskApiKey(apiKey),
        finishReason,
        streaming: true,
      },
    });

    logger.info(
      {
        tenantId,
        provider,
        task,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        finishReason,
      },
      'Streaming LLM execution completed',
    );

    return {
      response: fullResponse,
      model,
      provider,
      usage: {
        inputTokens,
        outputTokens,
      },
      latencyMs,
      finishReason,
    };
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
      'Streaming LLM execution failed',
    );
    throw error;
  } finally {
    abortSignal?.removeEventListener('abort', onAbort);
  }
}
