import type { TtsProvider, TtsRequest, TtsResponse } from './base.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { ProviderError } from '../../../lib/errors.js';

const VOICE_MAP: Record<string, string> = {
  pNInz6obpgDQGcFmaJgB: 'alloy',
  '21m00Tcm4TlvDq8ikWAM': 'nova',
  EXAVITQu4vr4xnSDxMaL: 'shimmer',
  MF3mGyEYCl7XYWbV9V6O: 'sage',
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

  constructor() {
    this.apiKey = env.OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async synthesize(request: TtsRequest): Promise<TtsResponse> {
    const start = Date.now();
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
          format: 'mp3',
          speed: request.speed ?? 1,
          input: request.text,
        }),
        signal: AbortSignal.timeout(15_000),
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
