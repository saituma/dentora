
import type { TtsProvider, TtsRequest, TtsResponse } from './base.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { ProviderError } from '../../../lib/errors.js';

const VOICE_MAP: Record<string, string> = {
  professional: 'pNInz6obpgDQGcFmaJgB',
  warm: '21m00Tcm4TlvDq8ikWAM',
  friendly: 'EXAVITQu4vr4xnSDxMaL',
  calm: 'MF3mGyEYCl7XYWbV9V6O',
};

export class ElevenLabsProvider implements TtsProvider {
  readonly name = 'elevenlabs';
  readonly type = 'tts' as const;

  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
  }

  async synthesize(request: TtsRequest): Promise<TtsResponse> {
    const start = Date.now();
    const voiceId = request.voiceId ?? VOICE_MAP.professional;

    try {
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: request.text,
            model_id: 'eleven_turbo_v2',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0,
              use_speaker_boost: true,
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `ElevenLabs API error: ${response.status} ${errorBody}`,
          this.name,
          response.status,
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
      logger.error({ err: error, provider: this.name }, 'ElevenLabs request failed');
      throw new ProviderError(
        `ElevenLabs request failed: ${(error as Error).message}`,
        this.name,
      );
    }
  }
}
