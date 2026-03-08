import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken, generateId } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { ProviderError } from '../../lib/errors.js';
import {
  loadLiveTenantAIContext,
  buildReceptionistSystemPrompt,
  type TenantAIContext,
} from '../ai/ai.service.js';
import {
  transcribeLiveAudio,
  listAvailableVoices,
  type AvailableVoiceOption,
} from '../onboarding/onboarding.service.js';
import { executeTtsWithFailover } from '../ai/engine/index.js';
import {
  createInitialReceptionistSessionState,
  processReceptionistTurnWithBooking,
  type ReceptionistSessionState,
} from '../ai/receptionist-booking.service.js';
import * as callService from '../calls/call.service.js';

interface BrowserLiveSession {
  sessionId: string;
  analyticsCallSessionId: string;
  tenantId: string;
  userId: string;
  ws: WebSocket;
  aiContext: TenantAIContext;
  systemPrompt: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionState: ReceptionistSessionState;
  audioBuffer: Buffer[];
  mimeType: string;
  language: string;
  speakingSpeed: number;
  voiceId: string;
  voiceName: string | null;
  configuredVoiceId: string;
  configuredVoiceName: string | null;
  voiceFallbackMessage: string | null;
  voiceTone: string;
  isProcessing: boolean;
  silenceTimer: ReturnType<typeof setTimeout> | null;
  generationId: number;
  responseAbortController: AbortController | null;
  lastTranscriptNormalized: string;
  lastTranscriptAt: number;
  startedAt: number;
}

const sessions = new Map<WebSocket, BrowserLiveSession>();

const SILENCE_TIMEOUT_MS = 300;
const MIN_AUDIO_BUFFER_BYTES = 1024;
const DUPLICATE_TRANSCRIPT_WINDOW_MS = 2500;
const EARLY_TTS_SENTENCE_MIN_CHARS = 48;
const EARLY_TTS_LONG_PHRASE_MIN_CHARS = 160;
const HANG_UP_PATTERNS = [
  /\bhang\s*up\b/i,
  /\bhung\s*up\b/i,
  /\bend (the )?call\b/i,
  /\bdisconnect\b/i,
  /\bgoodbye\b/i,
  /\bbye\b/i,
  /\bbye bye\b/i,
];

function sendEvent(ws: WebSocket, event: string, payload: Record<string, unknown> = {}): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event, ...payload }));
}

function extractSpeakableSegments(buffer: string, flushRemainder = false): { segments: string[]; remainder: string } {
  const segments: string[] = [];
  let start = 0;
  let lastCommittedIndex = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];
    const currentLength = index + 1 - lastCommittedIndex;
    const isStrongBoundary = char === '.' || char === '!' || char === '?';
    const isLongBoundary = char === ' ' && currentLength >= EARLY_TTS_LONG_PHRASE_MIN_CHARS;

    if ((isStrongBoundary && currentLength >= EARLY_TTS_SENTENCE_MIN_CHARS) || isLongBoundary) {
      const segment = buffer.slice(start, index + 1).trim();
      if (segment) segments.push(segment);
      start = index + 1;
      lastCommittedIndex = start;
    }
  }

  const remainder = buffer.slice(start).trim();
  if (flushRemainder && remainder) {
    segments.push(remainder);
    return { segments, remainder: '' };
  }

  return { segments, remainder };
}

function normalizeTranscript(transcript: string): string {
  return transcript.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectIntentFromTranscript(transcript: string): string {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return 'general';
  if (/\b(book|booking|appointment|schedule|availability|available|reschedule|cancel)\b/.test(normalized)) return 'booking';
  if (/\b(cost|price|pricing|insurance|cover|payment|billing)\b/.test(normalized)) return 'billing';
  if (/\b(hours|open|close|location|address|phone|email)\b/.test(normalized)) return 'clinic_info';
  if (/\b(emergency|pain|toothache|urgent)\b/.test(normalized)) return 'emergency';
  return 'general';
}

function isHangUpIntent(transcript: string): boolean {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return false;
  return HANG_UP_PATTERNS.some((pattern) => pattern.test(normalized));
}

function clearSilenceTimer(session: BrowserLiveSession): void {
  if (session.silenceTimer) {
    clearTimeout(session.silenceTimer);
    session.silenceTimer = null;
  }
}

function cancelAssistantResponse(session: BrowserLiveSession): void {
  session.generationId += 1;
  session.responseAbortController?.abort(new Error('Caller barged in'));
  session.responseAbortController = null;
  sendEvent(session.ws, 'assistant_interrupted');
}

function findBestLiveVoiceFallback(
  configuredVoice: AvailableVoiceOption,
  voices: AvailableVoiceOption[],
): AvailableVoiceOption | null {
  const liveVoices = voices.filter((voice) => voice.liveSupported !== false);
  if (liveVoices.length === 0) return null;

  const normalize = (value?: string | null) => String(value ?? '').trim().toLowerCase();
  const isUkVoice = (voice: AvailableVoiceOption): boolean => {
    const searchable = [
      voice.name,
      voice.label,
      voice.locale,
      voice.accent,
      voice.category,
    ]
      .map(normalize)
      .filter(Boolean)
      .join(' ');

    return [
      'en-gb',
      'en_gb',
      'en-uk',
      'british',
      'uk',
      'united kingdom',
      'england',
      'english',
      'london',
      'scottish',
      'welsh',
    ].some((token) => searchable.includes(token));
  };
  const configuredVoiceIsUk = isUkVoice(configuredVoice);

  return [...liveVoices]
    .sort((left, right) => {
      const score = (voice: AvailableVoiceOption): number => {
        let value = 0;

        if (configuredVoice.locale && voice.locale === configuredVoice.locale) value += 8;
        if (configuredVoiceIsUk && isUkVoice(voice)) value += 6;
        if (configuredVoice.accent && voice.accent === configuredVoice.accent) value += 4;
        if (configuredVoice.gender && voice.gender === configuredVoice.gender) value += 2;

        return value;
      };

      return score(right) - score(left);
    })[0] ?? null;
}

async function resolveLiveVoiceSelection(input: {
  configuredVoiceId: string;
}): Promise<{
  voiceId: string;
  voiceName: string | null;
  configuredVoiceName: string | null;
  voiceFallbackMessage: string | null;
}> {
  const configuredVoiceId = input.configuredVoiceId.trim();
  if (!configuredVoiceId) {
    return {
      voiceId: 'professional',
      voiceName: null,
      configuredVoiceName: null,
      voiceFallbackMessage: null,
    };
  }

  try {
    const voices = await listAvailableVoices();
    const configuredVoice = voices.find((voice) => voice.voiceId === configuredVoiceId) ?? null;
    const firstLiveSupportedVoice = voices.find((voice) => voice.liveSupported !== false) ?? null;

    if (!configuredVoice) {
      if (firstLiveSupportedVoice) {
        return {
          voiceId: firstLiveSupportedVoice.voiceId,
          voiceName: firstLiveSupportedVoice.name,
          configuredVoiceName: null,
          voiceFallbackMessage: `Configured voice ${configuredVoiceId} is not available on the current ElevenLabs account. Using free live-supported voice ${firstLiveSupportedVoice.name} instead.`,
        };
      }

      return {
        voiceId: configuredVoiceId,
        voiceName: null,
        configuredVoiceName: null,
        voiceFallbackMessage: null,
      };
    }

    if (configuredVoice.liveSupported !== false) {
      return {
        voiceId: configuredVoice.voiceId,
        voiceName: configuredVoice.name,
        configuredVoiceName: configuredVoice.name,
        voiceFallbackMessage: null,
      };
    }

    const fallbackVoice = findBestLiveVoiceFallback(configuredVoice, voices);
    if (!fallbackVoice) {
      return {
        voiceId: 'professional',
        voiceName: 'Default professional voice',
        configuredVoiceName: configuredVoice.name,
        voiceFallbackMessage: `Configured voice ${configuredVoice.name} requires a paid ElevenLabs plan for live API speech. No free ElevenLabs live voice is available on this account, so the live call is using the default free voice instead.`,
      };
    }

    return {
      voiceId: fallbackVoice.voiceId,
      voiceName: fallbackVoice.name,
      configuredVoiceName: configuredVoice.name,
      voiceFallbackMessage: `Configured voice ${configuredVoice.name} requires a paid ElevenLabs plan for live API speech. Using free live-supported voice ${fallbackVoice.name} instead.`,
    };
  } catch (error) {
    logger.warn({ err: error, configuredVoiceId }, 'Failed to resolve live-supported voice fallback');
    return {
      voiceId: configuredVoiceId,
      voiceName: null,
      configuredVoiceName: null,
      voiceFallbackMessage: null,
    };
  }
}

async function retryAssistantAudioWithFreeVoice(
  session: BrowserLiveSession,
  text: string,
  generationId: number,
  speedOverride?: number,
  voiceIdOverride?: string,
): Promise<boolean> {
  const sendAudio = async (): Promise<boolean> => {
    const ttsResult = await executeTtsWithFailover({
      workloadType: 'tts',
      tenantId: session.tenantId,
      language: session.language,
      ttsRequest: {
        text,
        voiceId: voiceIdOverride || session.voiceId || session.voiceTone || 'professional',
        speed: speedOverride ?? session.speakingSpeed,
        language: session.language,
        tenantId: session.tenantId,
        callSessionId: session.sessionId,
      },
    });

    if (generationId !== session.generationId) return false;

    sendEvent(session.ws, 'assistant_audio', {
      text,
      mimeType: 'audio/mpeg',
      audioBase64: ttsResult.audio.toString('base64'),
      provider: ttsResult.provider,
      voiceId: session.voiceId || session.voiceTone || 'professional',
      voiceName: session.voiceName,
      configuredVoiceId: session.configuredVoiceId,
      configuredVoiceName: session.configuredVoiceName,
      voiceFallbackMessage: session.voiceFallbackMessage,
    });
    return true;
  };

  try {
    const voices = await listAvailableVoices();
    const configuredVoice = voices.find((voice) => voice.voiceId === session.configuredVoiceId) ?? null;
    const fallbackVoice = configuredVoice
      ? findBestLiveVoiceFallback(configuredVoice, voices)
      : voices.find((voice) => voice.liveSupported !== false) ?? null;

    if (!fallbackVoice) {
      session.voiceId = 'professional';
      session.voiceName = 'Default professional voice';
      session.voiceFallbackMessage = session.configuredVoiceName
        ? `Configured voice ${session.configuredVoiceName} requires a paid ElevenLabs plan for live API speech. No free ElevenLabs live voice is available on this account, so the live call is using the default free voice instead.`
        : 'No free ElevenLabs live voice is available on this account, so the live call is using the default free voice instead.';
    } else {
      if (fallbackVoice.voiceId === session.voiceId) {
        return false;
      }

      session.voiceId = fallbackVoice.voiceId;
      session.voiceName = fallbackVoice.name;
      session.voiceFallbackMessage = session.configuredVoiceName
        ? `Configured voice ${session.configuredVoiceName} requires a paid ElevenLabs plan for live API speech. Using free live-supported voice ${fallbackVoice.name} instead.`
        : `Using free live-supported voice ${fallbackVoice.name} instead.`;
    }
    return await sendAudio();
  } catch (error) {
    logger.warn({ err: error, sessionId: session.sessionId }, 'Retry with free live-supported voice failed');

    try {
      session.voiceId = 'professional';
      session.voiceName = 'Default professional voice';
      session.voiceFallbackMessage = session.configuredVoiceName
        ? `Configured voice ${session.configuredVoiceName} could not be used for live speech. Using the default voice instead.`
        : 'Using the default voice instead.';
      return await sendAudio();
    } catch (fallbackError) {
      logger.warn({ err: fallbackError, sessionId: session.sessionId }, 'Retry with default professional voice failed');
      return false;
    }
  }
}

async function sendAssistantAudio(
  session: BrowserLiveSession,
  text: string,
  generationId: number,
  speedOverride?: number,
  voiceIdOverride?: string,
): Promise<boolean> {
  try {
    const ttsResult = await executeTtsWithFailover({
      workloadType: 'tts',
      tenantId: session.tenantId,
      language: session.language,
      ttsRequest: {
        text,
        voiceId: voiceIdOverride || session.voiceId || session.voiceTone || 'professional',
        speed: speedOverride ?? session.speakingSpeed,
        language: session.language,
        tenantId: session.tenantId,
        callSessionId: session.sessionId,
      },
    });

    if (generationId !== session.generationId) return false;

    sendEvent(session.ws, 'assistant_audio', {
      text,
      mimeType: 'audio/mpeg',
      audioBase64: ttsResult.audio.toString('base64'),
      provider: ttsResult.provider,
      voiceId: session.voiceId || session.voiceTone || 'professional',
      voiceName: session.voiceName,
      configuredVoiceId: session.configuredVoiceId,
      configuredVoiceName: session.configuredVoiceName,
    });
    return true;
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    const errorMessage = error instanceof Error ? error.message : 'TTS unavailable';
    const paymentRequired = errorMessage.toLowerCase().includes('paid_plan_required')
      || errorMessage.toLowerCase().includes('payment_required')
      || errorMessage.toLowerCase().includes('free users cannot use library voices');

    if (paymentRequired) {
      const retried = await retryAssistantAudioWithFreeVoice(session, text, generationId, speedOverride, voiceIdOverride);
      if (retried) return true;
    }

    logger.warn(
      { err: error, sessionId: session.sessionId, textPreview: text.slice(0, 120) },
      'Server-side TTS unavailable for live session; falling back to client speech',
    );
    if (generationId === session.generationId) {
      sendEvent(session.ws, 'assistant_audio_unavailable', {
        text,
        voiceId: session.voiceId || session.voiceTone || 'professional',
        voiceName: session.voiceName,
        configuredVoiceId: session.configuredVoiceId,
        configuredVoiceName: session.configuredVoiceName,
        provider: providerError?.context?.providerName ?? 'tts',
        reason: paymentRequired ? 'paid_plan_required' : 'tts_unavailable',
        message: paymentRequired
          ? 'This ElevenLabs voice requires a paid ElevenLabs plan for live API speech. The free preview clip can still play, but live call audio cannot use this voice on the current plan.'
          : errorMessage,
      });
    }
    return false;
  }
}

async function sendGreeting(session: BrowserLiveSession, greeting: string): Promise<void> {
  const generationId = session.generationId;
  session.conversationHistory.push({ role: 'assistant', content: greeting });
  sendEvent(session.ws, 'assistant_greeting', { text: greeting });
  await sendAssistantAudio(
    session,
    greeting,
    generationId,
    Math.max(session.speakingSpeed, 1.18),
    'alloy',
  );
  sendEvent(session.ws, 'assistant_done', { response: greeting });
}

async function processBufferedAudio(session: BrowserLiveSession): Promise<void> {
  clearSilenceTimer(session);

  if (session.isProcessing) return;

  const totalBytes = session.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
  if (totalBytes < MIN_AUDIO_BUFFER_BYTES) return;

  session.isProcessing = true;
  const generationId = session.generationId + 1;
  session.generationId = generationId;
  const responseAbortController = new AbortController();
  session.responseAbortController = responseAbortController;

  try {
    const audioBuffer = Buffer.concat(session.audioBuffer);
    session.audioBuffer = [];

    sendEvent(session.ws, 'transcription_state', { state: 'processing' });
    const transcript = (await transcribeLiveAudio(session.tenantId, {
      audioBuffer,
      mimeType: session.mimeType,
      language: session.language,
    })).trim();

    if (!transcript) {
      sendEvent(session.ws, 'transcription_state', { state: 'idle' });
      return;
    }

    await processRecognizedTranscript(session, transcript, generationId, responseAbortController);
  } catch (error) {
    const isAbort =
      error instanceof Error
      && (error.name === 'AbortError' || error.message.includes('barged in') || error.message.includes('disconnected'));

    if (!isAbort) {
      logger.error({ err: error, sessionId: session.sessionId }, 'Live voice turn failed');
      sendEvent(session.ws, 'error', { message: error instanceof Error ? error.message : 'Live voice failed' });
    }
  } finally {
    if (session.responseAbortController === responseAbortController) {
      session.responseAbortController = null;
    }
    session.isProcessing = false;
    sendEvent(session.ws, 'transcription_state', { state: 'idle' });
  }
}

async function processRecognizedTranscript(
  session: BrowserLiveSession,
  transcript: string,
  generationId: number,
  responseAbortController: AbortController,
): Promise<void> {
  const normalizedTranscript = normalizeTranscript(transcript);
  const isDuplicateTranscript =
    normalizedTranscript
    && normalizedTranscript === session.lastTranscriptNormalized
    && Date.now() - session.lastTranscriptAt < DUPLICATE_TRANSCRIPT_WINDOW_MS;

  if (isDuplicateTranscript) {
    logger.debug({ sessionId: session.sessionId, transcript }, 'Skipping duplicate live transcript');
    sendEvent(session.ws, 'transcription_state', { state: 'idle' });
    return;
  }

  session.lastTranscriptNormalized = normalizedTranscript;
  session.lastTranscriptAt = Date.now();
  sendEvent(session.ws, 'transcript_final', { transcript });

  if (isHangUpIntent(transcript)) {
    const goodbye = `Thanks for calling ${session.aiContext.clinicName || 'the clinic'}. Goodbye.`;
    sendEvent(session.ws, 'assistant_turn_start');
    sendEvent(session.ws, 'assistant_delta', { delta: goodbye });
    await sendAssistantAudio(session, goodbye, generationId);
    if (generationId !== session.generationId) return;
    session.conversationHistory.push(
      { role: 'user', content: transcript },
      { role: 'assistant', content: goodbye },
    );
    sendEvent(session.ws, 'assistant_done', { response: goodbye });
    sendEvent(session.ws, 'session_ended', { reason: 'caller_hangup' });
    return;
  }

  sendEvent(session.ws, 'assistant_turn_start');
  const turnStartedAt = Date.now();
  const turnResult = await processReceptionistTurnWithBooking({
    tenantId: session.tenantId,
    sessionId: session.sessionId,
    aiContext: session.aiContext,
    systemPrompt: session.systemPrompt,
    conversationHistory: session.conversationHistory,
    userMessage: transcript,
    sessionState: session.sessionState,
  });
  session.sessionState = turnResult.sessionState;

  if (generationId !== session.generationId) return;

  const finalResponseText = turnResult.response.trim();
  await callService.logCallEvent({
    tenantId: session.tenantId,
    callSessionId: session.analyticsCallSessionId,
    eventType: 'conversation.turn',
    actor: 'ai',
    payload: {
      source: 'sidebar-test',
      userText: transcript,
      aiText: finalResponseText,
    },
    latencyMs: Date.now() - turnStartedAt,
  });
  if (finalResponseText) {
    sendEvent(session.ws, 'assistant_delta', { delta: finalResponseText });
  }

  const { segments } = extractSpeakableSegments(finalResponseText, true);
  const ttsSegments = segments.length > 0 ? segments : (finalResponseText ? [finalResponseText] : []);
  for (const segment of ttsSegments) {
    await sendAssistantAudio(session, segment, generationId);
  }

  if (generationId !== session.generationId) return;

  session.conversationHistory.push(
    { role: 'user', content: transcript },
    { role: 'assistant', content: finalResponseText },
  );
  sendEvent(session.ws, 'assistant_done', { response: finalResponseText });
}

async function initializeSession(ws: WebSocket, requestUrl: URL): Promise<BrowserLiveSession> {
  const token = requestUrl.searchParams.get('token');
  if (!token) {
    throw new Error('Missing auth token');
  }

  const payload = verifyAccessToken(token);
  const tenantId = payload.tenantId;
  const userId = payload.userId;
  const analyticsSession = await callService.createBrowserTestCallSession({
    tenantId,
    configVersionId: null,
  });
  const aiContext = await loadLiveTenantAIContext(tenantId);
  const systemPrompt = buildReceptionistSystemPrompt(aiContext, 'sidebar-test');
  const voiceSettings = aiContext.voiceProfile as Record<string, unknown>;
  const configuredVoiceId = String(voiceSettings.voiceId || voiceSettings.tone || 'professional');
  const overrideVoiceId = requestUrl.searchParams.get('overrideVoiceId')?.trim() || '';
  const resolvedVoice = await resolveLiveVoiceSelection({ configuredVoiceId });

  if (overrideVoiceId) {
    try {
      const voices = await listAvailableVoices();
      const overrideVoice = voices.find((voice) => voice.voiceId === overrideVoiceId) ?? null;
      if (overrideVoice && overrideVoice.liveSupported !== false) {
        resolvedVoice.voiceId = overrideVoice.voiceId;
        resolvedVoice.voiceName = overrideVoice.name;
        resolvedVoice.voiceFallbackMessage = configuredVoiceId !== overrideVoice.voiceId
          ? `Configured voice ${resolvedVoice.configuredVoiceName ?? configuredVoiceId} is being overridden for this live test call. Using live-supported voice ${overrideVoice.name}.`
          : resolvedVoice.voiceFallbackMessage;
      }
    } catch (error) {
      logger.warn({ err: error, overrideVoiceId, tenantId }, 'Failed to apply live test voice override');
    }
  }

  const session: BrowserLiveSession = {
    sessionId: generateId(),
    analyticsCallSessionId: analyticsSession.id,
    tenantId,
    userId,
    ws,
    aiContext,
    systemPrompt,
    conversationHistory: [],
    sessionState: createInitialReceptionistSessionState(),
    audioBuffer: [],
    mimeType: 'audio/webm',
    language: String(voiceSettings.language || 'en-US'),
    speakingSpeed: Number(voiceSettings.speechSpeed || voiceSettings.speakingSpeed || 1.08),
    voiceId: resolvedVoice.voiceId,
    voiceName: resolvedVoice.voiceName,
    configuredVoiceId,
    configuredVoiceName: resolvedVoice.configuredVoiceName,
    voiceFallbackMessage: resolvedVoice.voiceFallbackMessage,
    voiceTone: String(voiceSettings.tone || 'professional'),
    isProcessing: false,
    silenceTimer: null,
    generationId: 1,
    responseAbortController: null,
    lastTranscriptNormalized: '',
    lastTranscriptAt: 0,
    startedAt: Date.now(),
  };

  return session;
}

async function cleanupSession(ws: WebSocket): Promise<void> {
  const session = sessions.get(ws);
  if (!session) return;

  clearSilenceTimer(session);
  session.responseAbortController?.abort(new Error('Client disconnected'));
  sessions.delete(ws);

  try {
    const durationSeconds = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
    const lastCallerUtterance = [...session.conversationHistory].reverse().find((entry) => entry.role === 'user')?.content ?? '';
    const lastAssistantUtterance = [...session.conversationHistory].reverse().find((entry) => entry.role === 'assistant')?.content ?? '';

    if (session.conversationHistory.length > 0) {
      await callService.saveTranscript({
        tenantId: session.tenantId,
        callSessionId: session.analyticsCallSessionId,
        fullTranscript: session.conversationHistory.map((entry) => ({
          role: entry.role,
          text: entry.content,
        })),
        summary: lastAssistantUtterance || 'Browser test call completed',
        intentDetected: detectIntentFromTranscript(lastCallerUtterance),
      });
    }

    await callService.updateCallStatus(session.tenantId, session.analyticsCallSessionId, 'completed', {
      durationSeconds,
      endReason: 'sidebar_test_closed',
    });
  } catch (error) {
    logger.error({ err: error, sessionId: session.sessionId }, 'Failed to persist browser test call analytics');
  }
}

export function attachReceptionistLiveWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({
    noServer: true,
  });

  wss.on('connection', async (ws, req) => {
    try {
      const requestUrl = new URL(req.url || '', `http://${req.headers.host}`);
      const session = await initializeSession(ws, requestUrl);
      sessions.set(ws, session);

      sendEvent(ws, 'session_ready', {
        sessionId: session.sessionId,
        voiceId: session.voiceId,
        voiceName: session.voiceName,
        configuredVoiceId: session.configuredVoiceId,
        configuredVoiceName: session.configuredVoiceName,
        voiceFallbackMessage: session.voiceFallbackMessage,
      });

      const aiContext = await loadLiveTenantAIContext(session.tenantId);
      const voiceSettings = aiContext.voiceProfile as Record<string, unknown>;
      const greeting =
        String(voiceSettings.greetingMessage || voiceSettings.greeting || '').trim()
        || `Hi, welcome to ${aiContext.clinicName}, what can I help you with today?`;
      await sendGreeting(session, greeting);

      ws.on('message', (raw) => {
        const activeSession = sessions.get(ws);
        if (!activeSession) return;

        try {
          const message = JSON.parse(raw.toString()) as {
            event?: string;
            audioBase64?: string;
            mimeType?: string;
            language?: string;
            transcript?: string;
          };

          switch (message.event) {
            case 'audio_chunk': {
              if (!message.audioBase64) return;
              const audioChunk = Buffer.from(message.audioBase64, 'base64');
              if (!audioChunk.length) return;
              activeSession.audioBuffer.push(audioChunk);
              if (message.mimeType) {
                activeSession.mimeType = message.mimeType.split(';')[0] || activeSession.mimeType;
              }
              if (message.language) {
                activeSession.language = message.language;
              }
              clearSilenceTimer(activeSession);
              activeSession.silenceTimer = setTimeout(() => {
                void processBufferedAudio(activeSession);
              }, SILENCE_TIMEOUT_MS);
              break;
            }

            case 'flush_audio':
              void processBufferedAudio(activeSession);
              break;

            case 'user_text': {
              const transcript = String(message.transcript || '').trim();
              if (!transcript) break;
              if (activeSession.isProcessing) break;
              clearSilenceTimer(activeSession);
              activeSession.audioBuffer = [];
              activeSession.isProcessing = true;
              const generationId = activeSession.generationId + 1;
              activeSession.generationId = generationId;
              const responseAbortController = new AbortController();
              activeSession.responseAbortController = responseAbortController;
              sendEvent(activeSession.ws, 'transcription_state', { state: 'processing' });
              void processRecognizedTranscript(activeSession, transcript, generationId, responseAbortController)
                .catch((error) => {
                  logger.error({ err: error, sessionId: activeSession.sessionId }, 'Live user_text turn failed');
                  sendEvent(activeSession.ws, 'error', { message: error instanceof Error ? error.message : 'Live voice failed' });
                })
                .finally(() => {
                  if (activeSession.responseAbortController === responseAbortController) {
                    activeSession.responseAbortController = null;
                  }
                  activeSession.isProcessing = false;
                  sendEvent(activeSession.ws, 'transcription_state', { state: 'idle' });
                });
              break;
            }

            case 'barge_in':
              cancelAssistantResponse(activeSession);
              break;

            case 'stop':
              void cleanupSession(ws);
              break;

            default:
              logger.debug({ sessionId: activeSession.sessionId, event: message.event }, 'Unknown live session event');
          }
        } catch (error) {
          logger.error({ err: error }, 'Failed to process live session message');
          sendEvent(ws, 'error', { message: 'Failed to process live audio message' });
        }
      });

      ws.on('close', () => {
        void cleanupSession(ws);
      });

      ws.on('error', (error) => {
        logger.error({ err: error, sessionId: session.sessionId }, 'Live session socket error');
        void cleanupSession(ws);
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize live receptionist WebSocket');
      ws.close(4001, 'Unauthorized');
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url || '', `http://${req.headers.host}`);
    if (requestUrl.pathname !== '/api/llm/receptionist-test/live') {
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  logger.info('Receptionist live WebSocket server attached');
}
