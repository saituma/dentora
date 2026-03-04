
import type { LlmProvider, LlmRequest, LlmResponse } from './base.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { ProviderError } from '../../../lib/errors.js';

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly type = 'llm' as const;

  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.ANTHROPIC_API_KEY;
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const start = Date.now();
    const model = request.model || 'claude-3-5-sonnet-20241022';

    const systemMessage = request.messages.find((m) => m.role === 'system')?.content ?? '';
    const conversationMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system: systemMessage,
          messages: conversationMessages,
          max_tokens: request.maxTokens ?? 512,
          temperature: request.temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `Anthropic API error: ${response.status} ${errorBody}`,
          this.name,
          response.status,
        );
      }

      const data = await response.json() as any;
      const latencyMs = Date.now() - start;

      return {
        content: data.content?.[0]?.text ?? '',
        model: data.model,
        provider: this.name,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        latencyMs,
        finishReason: data.stop_reason ?? 'unknown',
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const latencyMs = Date.now() - start;
      logger.error({ err: error, provider: this.name, latencyMs }, 'Anthropic request failed');
      throw new ProviderError(
        `Anthropic request failed: ${(error as Error).message}`,
        this.name,
      );
    }
  }
}
