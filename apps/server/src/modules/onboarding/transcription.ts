import { env } from '../../config/env.js';
import { ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { getPreferredTtsProviderForVoiceId, isCustomTtsVoiceId } from '../ai/providers/voice-routing.js';

const LIVE_TRANSCRIBE_ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/pcm']);

function normalizeLiveTranscriptionLanguage(language?: string): string {
  const raw = (language || 'en-US').trim();
  if (!raw) return 'en-US';

  const lower = raw.toLowerCase();
  if (lower === 'en') return 'en-US';
  if (lower === 'en-gb' || lower === 'en-uk') return 'en-GB';
  if (lower === 'en-au') return 'en-AU';
  if (lower === 'en-ca') return 'en-CA';
  if (lower === 'en-in') return 'en-IN';

  return raw;
}

function toOpenAiTranscriptionLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  const [base] = normalized.split('-');
  return base || 'en';
}

export async function generateVoicePreview(
  tenantId: string,
  data: { voiceId: string; text: string; speed?: number; language?: string },
): Promise<Buffer> {
  const { getTtsAdapter } = await import('../ai/providers/index.js');
  const providerName = !isCustomTtsVoiceId(data.voiceId) && env.OPENAI_API_KEY
    ? 'openai'
    : getPreferredTtsProviderForVoiceId(data.voiceId) ?? env.TTS_PROVIDER;
  const ttsProvider = getTtsAdapter(providerName);
  const result = await ttsProvider.synthesize({
    text: data.text,
    voiceId: data.voiceId,
    speed: data.speed ?? 1,
    language: data.language ?? 'en-US',
    tenantId,
  });

  logger.info({ tenantId, voiceId: data.voiceId, provider: ttsProvider.name, latencyMs: result.latencyMs }, 'Voice preview generated');
  return result.audio;
}

async function tryDeepgramTranscription(input: {
  audioBuffer: Buffer;
  mimeType: string;
  language: string;
}): Promise<string> {
  if (!env.DEEPGRAM_API_KEY) return '';

  try {
    const query = new URLSearchParams({
      model: 'nova-2',
      language: input.language,
      smart_format: 'true',
      punctuate: 'true',
      paragraphs: 'false',
      diarize: 'false',
      filler_words: 'false',
    });

    const response = await fetch(`https://api.deepgram.com/v1/listen?${query.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': input.mimeType,
      },
      body: new Uint8Array(input.audioBuffer.buffer, input.audioBuffer.byteOffset, input.audioBuffer.byteLength) as never,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return '';

    const payload = (await response.json()) as {
      results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
    };
    return payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function transcribeLiveAudio(
  tenantId: string,
  data: { audioBuffer: Buffer; mimeType: string; language?: string },
): Promise<string> {
  if (!env.OPENAI_API_KEY && !env.DEEPGRAM_API_KEY) {
    throw new ValidationError('OpenAI or Deepgram API key is required for live transcription');
  }

  const rawMimeType = (data.mimeType || 'audio/webm').toLowerCase();
  const mimeType = rawMimeType.split(';')[0] || 'audio/webm';
  const language = normalizeLiveTranscriptionLanguage(data.language);
  const openAiLanguage = toOpenAiTranscriptionLanguage(language);

  if (mimeType.startsWith('video/') || mimeType.startsWith('application/') || mimeType === 'audio/mp4') {
    throw new ValidationError(`Unsupported live transcription mime type: ${mimeType}`);
  }
  if (!LIVE_TRANSCRIBE_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError(`Unsupported live transcription mime type: ${mimeType}`);
  }

  const audioBuffer = data.audioBuffer;
  if (!audioBuffer.length) throw new ValidationError('Empty audio payload');
  if (audioBuffer.length > 1024 * 1024) throw new ValidationError('Audio chunk too large; max size is 1MB');
  if (audioBuffer.length < 1024) return '';

  logger.debug({ tenantId, mimeType, language, chunkBytes: audioBuffer.length }, 'Live transcription chunk received');

  const extension = mimeType.includes('wav')
    ? 'wav'
    : mimeType.includes('pcm')
      ? 'pcm'
      : mimeType.includes('mp4') || mimeType.includes('m4a')
        ? 'mp4'
        : mimeType.includes('mpeg') || mimeType.includes('mp3')
          ? 'mp3'
          : mimeType.includes('ogg')
            ? 'ogg'
            : 'webm';

  const startedAt = Date.now();
  const deepgramTranscript = await tryDeepgramTranscription({ audioBuffer, mimeType, language });
  if (deepgramTranscript) {
    logger.info({
      tenantId,
      mimeType,
      language,
      chunkBytes: audioBuffer.length,
      latencyMs: Date.now() - startedAt,
      transcriptChars: deepgramTranscript.length,
      transcriptText: deepgramTranscript,
      provider: 'deepgram',
    }, 'Live audio transcribed');
    return deepgramTranscript;
  }

  if (!env.OPENAI_API_KEY) return '';

  const form = new FormData();
  form.append('model', 'whisper-1');
  form.append('language', openAiLanguage);
  form.append('response_format', 'json');
  form.append('file', new Blob([Uint8Array.from(audioBuffer)], { type: mimeType }), `live-input.${extension}`);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      ...(process.env.OPENAI_ORG_ID ? { 'OpenAI-Organization': process.env.OPENAI_ORG_ID } : {}),
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });

  if (response.ok) {
    const result = (await response.json()) as { text?: string };
    const transcript = (result.text || '').trim();
    logger.info({
      tenantId,
      mimeType,
      language: openAiLanguage,
      chunkBytes: audioBuffer.length,
      latencyMs: Date.now() - startedAt,
      transcriptChars: transcript.length,
      transcriptText: transcript,
      provider: 'openai',
    }, 'Live audio transcribed');
    return transcript;
  }

  const errorBody = await response.text();
  const isRecoverableChunkError = response.status === 400
    && errorBody.includes('Audio file might be corrupted or unsupported')
    && errorBody.includes('"param": "file"');

  if (isRecoverableChunkError) {
    logger.debug({ tenantId, mimeType, chunkBytes: audioBuffer.length }, 'OpenAI rejected WebM; trying Deepgram fallback');
    const fallback = await tryDeepgramTranscription({ audioBuffer, mimeType, language });
    if (fallback) {
      logger.info({ tenantId, chunkBytes: audioBuffer.length, transcriptChars: fallback.length }, 'Live audio transcribed via Deepgram fallback');
      return fallback;
    }
    return '';
  }

  logger.warn({
    tenantId,
    mimeType,
    chunkBytes: audioBuffer.length,
    providerStatus: response.status,
    providerResponse: errorBody.slice(0, 1000),
  }, 'Live transcription provider request failed');

  let providerMessage = 'Live transcription request was rejected by provider';
  try {
    const parsed = JSON.parse(errorBody) as { error?: { message?: string } };
    if (parsed.error?.message) providerMessage = parsed.error.message;
  } catch {
    if (errorBody.trim()) providerMessage = errorBody.trim();
  }

  throw new ValidationError(`Live transcription failed (${response.status}): ${providerMessage}`);
}
