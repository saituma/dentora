
import type { SttProvider, SttRequest, SttResponse, TtsProvider, TtsRequest, TtsResponse } from './base.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { ProviderError } from '../../../lib/errors.js';
import { isCustomTtsVoiceId } from './voice-routing.js';

export class GoogleSttProvider implements SttProvider {
  readonly name = 'google-stt';
  readonly type = 'stt' as const;

  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.GOOGLE_AI_API_KEY ?? '';
    this.baseUrl = 'https://speech.googleapis.com/v1';
  }

  async transcribe(request: SttRequest): Promise<SttResponse> {
    const start = Date.now();

    try {
      const audioBuffer = request.audio instanceof Buffer
        ? request.audio
        : Buffer.from(await new Response(request.audio as any).arrayBuffer());

      const audioContent = audioBuffer.toString('base64');

      const response = await fetch(
        `${this.baseUrl}/speech:recognize?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              encoding: 'LINEAR16',
              sampleRateHertz: 16000,
              languageCode: request.language,
              model: request.model || 'latest_long',
              enableAutomaticPunctuation: true,
            },
            audio: { content: audioContent },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `Google STT API error: ${response.status} ${errorBody}`,
          this.name,
          response.status,
        );
      }

      const data = await response.json() as any;
      const latencyMs = Date.now() - start;
      const result = data.results?.[0]?.alternatives?.[0];

      return {
        text: result?.transcript ?? '',
        confidence: result?.confidence ?? 0,
        provider: this.name,
        latencyMs,
        durationMs: 0,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      logger.error({ err: error, provider: this.name }, 'Google STT request failed');
      throw new ProviderError(
        `Google STT request failed: ${(error as Error).message}`,
        this.name,
      );
    }
  }
}

export class GoogleTtsProvider implements TtsProvider {
  readonly name = 'google-tts';
  readonly type = 'tts' as const;

  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.GOOGLE_AI_API_KEY ?? '';
    this.baseUrl = 'https://texttospeech.googleapis.com/v1';
  }

  async synthesize(request: TtsRequest): Promise<TtsResponse> {
    const start = Date.now();
    if (isCustomTtsVoiceId(request.voiceId)) {
      throw new ProviderError(
        `Google TTS does not support custom voiceId '${request.voiceId}'`,
        this.name,
        400,
      );
    }

    const voiceName = this.mapVoiceTone(request.voiceId ?? 'professional', request.language);

    try {
      const response = await fetch(
        `${this.baseUrl}/text:synthesize?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: request.text },
            voice: {
              languageCode: request.language || 'en-US',
              name: voiceName,
              ssmlGender: 'FEMALE',
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: 1.0,
              pitch: 0,
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `Google TTS API error: ${response.status} ${errorBody}`,
          this.name,
          response.status,
        );
      }

      const data = await response.json() as any;
      const latencyMs = Date.now() - start;
      const audio = Buffer.from(data.audioContent, 'base64');

      return {
        audio,
        provider: this.name,
        latencyMs,
        characterCount: request.text.length,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      logger.error({ err: error, provider: this.name }, 'Google TTS request failed');
      throw new ProviderError(
        `Google TTS request failed: ${(error as Error).message}`,
        this.name,
      );
    }
  }

  private mapVoiceTone(tone: string, language?: string): string {
    const lang = language || 'en-US';
    const toneMap: Record<string, string> = {
      professional: `${lang}-Standard-C`,
      warm: `${lang}-Wavenet-F`,
      friendly: `${lang}-Wavenet-E`,
      calm: `${lang}-Standard-A`,
    };
    return toneMap[tone] ?? toneMap.professional;
  }
}
