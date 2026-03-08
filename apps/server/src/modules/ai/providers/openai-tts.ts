import type { TtsProvider, TtsRequest, TtsResponse } from './base.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { ProviderError } from '../../../lib/errors.js';
import { isCustomTtsVoiceId } from './voice-routing.js';

const VOICE_MAP: Record<string, string> = {
  alloy: 'alloy',
  echo: 'echo',
  nova: 'nova',
  sage: 'sage',
  shimmer: 'shimmer',
  professional: 'alloy',
  warm: 'nova',
  friendly: 'shimmer',
  calm: 'sage',
};

export class OpenAITtsProvider implements TtsProvider {
  readonly name = 'openai';
  readonly type = 'tts' as const;

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async synthesize(request: TtsRequest): Promise<TtsResponse> {
    const start = Date.now();
    if (isCustomTtsVoiceId(request.voiceId)) {
      throw new ProviderError(
        `OpenAI TTS does not support custom voiceId '${request.voiceId}'`,
        this.name,
        400,
      );
    }
    const voice = VOICE_MAP[request.voiceId] ?? 'alloy';

    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice,
          response_format: 'mp3',
          speed: request.speed ?? 1,
          input: request.text,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `OpenAI TTS API error: ${response.status} ${errorBody}`,
          this.name,
          502,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);
      const latencyMs = Date.now() - start;

      return {
        audio,
        provider: this.name,
        latencyMs,
        characterCount: request.text.length,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      logger.error({ err: error, provider: this.name }, 'OpenAI TTS request failed');
      throw new ProviderError(
        `OpenAI TTS request failed: ${(error as Error).message}`,
        this.name,
      );
    }
  }
}
