import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken, generateId } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import {
  loadLiveTenantAIContext,
  buildReceptionistSystemPrompt,
  type TenantAIContext,
} from '../ai/ai.service.js';
import { transcribeLiveAudio } from '../onboarding/onboarding.service.js';
import { executeTtsWithFailover } from '../ai/engine/index.js';
import {
  createInitialReceptionistSessionState,
  processReceptionistTurnWithBooking,
  type ReceptionistSessionState,
} from '../ai/receptionist-booking.service.js';

interface BrowserLiveSession {
  sessionId: string;
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
  voiceId: string;
  voiceTone: string;
  isProcessing: boolean;
  silenceTimer: ReturnType<typeof setTimeout> | null;
  generationId: number;
  responseAbortController: AbortController | null;
  lastTranscriptNormalized: string;
  lastTranscriptAt: number;
}

const sessions = new Map<WebSocket, BrowserLiveSession>();

const SILENCE_TIMEOUT_MS = 300;
const MIN_AUDIO_BUFFER_BYTES = 1024;
const DUPLICATE_TRANSCRIPT_WINDOW_MS = 2500;
const EARLY_TTS_SENTENCE_MIN_CHARS = 12;
const EARLY_TTS_CLAUSE_MIN_CHARS = 24;
const EARLY_TTS_LONG_PHRASE_MIN_CHARS = 48;

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
    const isSoftBoundary =
      (char === ',' || char === ';' || char === ':') && currentLength >= EARLY_TTS_CLAUSE_MIN_CHARS;
    const isLongBoundary = char === ' ' && currentLength >= EARLY_TTS_LONG_PHRASE_MIN_CHARS;

    if ((isStrongBoundary && currentLength >= EARLY_TTS_SENTENCE_MIN_CHARS) || isSoftBoundary || isLongBoundary) {
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

async function sendAssistantAudio(session: BrowserLiveSession, text: string, generationId: number): Promise<boolean> {
  try {
    const ttsResult = await executeTtsWithFailover({
      workloadType: 'tts',
      tenantId: session.tenantId,
      language: session.language,
      ttsRequest: {
      text,
        voiceId: session.voiceId || session.voiceTone || 'professional',
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
    });
    return true;
  } catch (error) {
    logger.warn(
      { err: error, sessionId: session.sessionId, textPreview: text.slice(0, 120) },
      'Server-side TTS unavailable for live session; falling back to client speech',
    );
    if (generationId === session.generationId) {
      sendEvent(session.ws, 'assistant_audio_unavailable', { text });
    }
    return false;
  }
}

async function sendGreeting(session: BrowserLiveSession, greeting: string): Promise<void> {
  const generationId = session.generationId;
  session.conversationHistory.push({ role: 'assistant', content: greeting });
  sendEvent(session.ws, 'assistant_greeting', { text: greeting });
  await sendAssistantAudio(session, greeting, generationId);
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
  sendEvent(session.ws, 'assistant_turn_start');
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
  const aiContext = await loadLiveTenantAIContext(tenantId);
  const systemPrompt = buildReceptionistSystemPrompt(aiContext, 'sidebar-test');
  const voiceSettings = aiContext.voiceProfile as Record<string, unknown>;

  const session: BrowserLiveSession = {
    sessionId: generateId(),
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
    voiceId: String(voiceSettings.voiceId || voiceSettings.tone || 'professional'),
    voiceTone: String(voiceSettings.tone || 'professional'),
    isProcessing: false,
    silenceTimer: null,
    generationId: 1,
    responseAbortController: null,
    lastTranscriptNormalized: '',
    lastTranscriptAt: 0,
  };

  return session;
}

function cleanupSession(ws: WebSocket): void {
  const session = sessions.get(ws);
  if (!session) return;

  clearSilenceTimer(session);
  session.responseAbortController?.abort(new Error('Client disconnected'));
  sessions.delete(ws);
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

      sendEvent(ws, 'session_ready', { sessionId: session.sessionId });

      const aiContext = await loadLiveTenantAIContext(session.tenantId);
      const voiceSettings = aiContext.voiceProfile as Record<string, unknown>;
      const greeting =
        String(voiceSettings.greetingMessage || voiceSettings.greeting || '').trim()
        || `Hello, thank you for calling ${aiContext.clinicName}. How may I help you today?`;
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
              cleanupSession(ws);
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
        cleanupSession(ws);
      });

      ws.on('error', (error) => {
        logger.error({ err: error, sessionId: session.sessionId }, 'Live session socket error');
        cleanupSession(ws);
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
