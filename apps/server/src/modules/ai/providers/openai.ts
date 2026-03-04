
import type { LlmProvider, LlmRequest, LlmResponse } from './base.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { ProviderError } from '../../../lib/errors.js';

export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai';
  readonly type = 'llm' as const;

  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const start = Date.now();
    const model = request.model || 'gpt-4o-mini';
    const effectiveKey = request.apiKey || this.apiKey;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveKey}`,
          ...(process.env.OPENAI_ORG_ID ? { 'OpenAI-Organization': process.env.OPENAI_ORG_ID } : {}),
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          max_tokens: request.maxTokens ?? 512,
          temperature: request.temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `OpenAI API error: ${response.status} ${errorBody}`,
          this.name,
          response.status,
        );
      }

      const data = await response.json() as any;
      const latencyMs = Date.now() - start;

      return {
        content: data.choices[0]?.message?.content ?? '',
        model: data.model,
        provider: this.name,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        latencyMs,
        finishReason: data.choices[0]?.finish_reason ?? 'unknown',
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const latencyMs = Date.now() - start;
      logger.error({ err: error, provider: this.name, latencyMs }, 'OpenAI request failed');
      throw new ProviderError(
        `OpenAI request failed: ${(error as Error).message}`,
        this.name,
      );
    }
  }
}
