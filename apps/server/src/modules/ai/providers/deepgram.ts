
import type { SttProvider, SttRequest, SttResponse } from './base.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { ProviderError } from '../../../lib/errors.js';

export class DeepgramProvider implements SttProvider {
  readonly name = 'deepgram';
  readonly type = 'stt' as const;

  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.DEEPGRAM_API_KEY;
    this.baseUrl = 'https://api.deepgram.com/v1';
  }

  async transcribe(request: SttRequest): Promise<SttResponse> {
    const start = Date.now();
    const model = request.model || 'nova-2';

    try {
      const audioBuffer = request.audio instanceof Buffer
        ? request.audio
        : Buffer.from(await new Response(request.audio as ReadableStream).arrayBuffer());

      const response = await fetch(
        `${this.baseUrl}/listen?model=${model}&language=${request.language}&smart_format=true`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${this.apiKey}`,
            'Content-Type': 'audio/wav',
          },
          body: new Uint8Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength) as BodyInit,
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `Deepgram API error: ${response.status} ${errorBody}`,
          this.name,
          response.status,
        );
      }

      const data = await response.json() as {
        results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> };
        metadata?: { duration?: number };
      };
      const latencyMs = Date.now() - start;
      const channel = data.results?.channels?.[0];
      const alternative = channel?.alternatives?.[0];

      return {
        text: alternative?.transcript ?? '',
        confidence: alternative?.confidence ?? 0,
        provider: this.name,
        latencyMs,
        durationMs: (data.metadata?.duration ?? 0) * 1000,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      logger.error({ err: error, provider: this.name }, 'Deepgram request failed');
      throw new ProviderError(
        `Deepgram request failed: ${(error as Error).message}`,
        this.name,
      );
    }
  }
}
