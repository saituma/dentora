
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { logger } from '../../lib/logger.js';
import { loadTenantAIContext, buildSystemPrompt } from '../ai/ai.service.js';
import * as callService from '../calls/call.service.js';
import { resolveTenantByPhone } from './telephony.service.js';
import { db } from '../../db/index.js';
import { tenantActiveConfig, twilioNumbers, callSessions, tenantConfigVersions } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { generateId } from '../../lib/crypto.js';
import { executeSttWithFailover, executeTtsWithFailover } from '../ai/engine/index.js';
import { resolveApiKey } from '../api-keys/api-key.service.js';
import { streamLlm } from '../llm/llm.service.js';

interface MediaStreamSession {
  callSessionId: string;
  tenantId: string;
  configVersionId: string;
  configVersion: number;
  streamSid: string;
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  audioBuffer: Buffer[];
  isProcessing: boolean;
  language: string;
  voiceId: string;
  voiceTone: string;
  ws: WebSocket;
  lastActivityAt: number;
  turnCount: number;
}

const activeSessions = new Map<string, MediaStreamSession>();

const MIN_AUDIO_BUFFER_SIZE = 8000;
const SILENCE_TIMEOUT_MS = 800;
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000;

function extractSpeakableSegments(buffer: string, flushRemainder = false): { segments: string[]; remainder: string } {
  const segments: string[] = [];
  let start = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (char === '.' || char === '!' || char === '?') {
      const segment = buffer.slice(start, index + 1).trim();
      if (segment) segments.push(segment);
      start = index + 1;
    }
  }

  const remainder = buffer.slice(start).trim();
  if (flushRemainder && remainder) {
    segments.push(remainder);
    return { segments, remainder: '' };
  }

  return { segments, remainder };
}

export function attachMediaStreamWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({
    server,
    path: '/api/telephony/media-stream',
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const callSessionId = url.pathname.split('/').pop() || '';

    logger.info({ callSessionId }, 'Media stream WebSocket connected');

    let sessionInitialized = false;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.event) {
          case 'connected':
            logger.info({ callSessionId }, 'Twilio media stream connected');
            break;

          case 'start':
            await handleStreamStart(ws, callSessionId, message);
            sessionInitialized = true;
            break;

          case 'media':
            if (!sessionInitialized) break;
            handleMediaPayload(callSessionId, message);

            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
              processBufferedAudio(callSessionId).catch((err) => {
                logger.error({ err, callSessionId }, 'Failed to process buffered audio');
              });
            }, SILENCE_TIMEOUT_MS);
            break;

          case 'stop':
            logger.info({ callSessionId }, 'Twilio media stream stopped');
            await handleStreamEnd(callSessionId);
            break;

          case 'mark':
            logger.debug({ callSessionId, name: message.mark?.name }, 'Mark received');
            break;

          default:
            logger.debug({ event: message.event, callSessionId }, 'Unknown media stream event');
        }
      } catch (err) {
        logger.error({ err, callSessionId }, 'Error processing media stream message');
      }
    });

    ws.on('close', async () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      await handleStreamEnd(callSessionId);
      logger.info({ callSessionId }, 'Media stream WebSocket closed');
    });

    ws.on('error', (err) => {
      logger.error({ err, callSessionId }, 'Media stream WebSocket error');
    });
  });

  logger.info('Twilio Media Stream WebSocket server attached');
}

async function handleStreamStart(
  ws: WebSocket,
  callSessionId: string,
  message: any,
): Promise<void> {
  const { streamSid, start: startData } = message;
  const callerNumber = startData?.callSid;

  try {
    const customParameters = startData?.customParameters || {};
    const tenantId = customParameters.tenantId;
    const configVersionId = customParameters.configVersionId;

    if (!tenantId || !configVersionId) {
      logger.error({ callSessionId }, 'Missing tenantId or configVersionId in stream start');
      ws.close();
      return;
    }

    // Resolve config version UUID to version number
    const [cvRow] = await db
      .select({ version: tenantConfigVersions.version })
      .from(tenantConfigVersions)
      .where(eq(tenantConfigVersions.id, configVersionId))
      .limit(1);

    const configVersion = cvRow?.version ?? 1;

    const aiContext = await loadTenantAIContext(tenantId, configVersion);
    const systemPrompt = buildSystemPrompt(aiContext);
    const voiceSettings = aiContext.voiceProfile as any;

    const session: MediaStreamSession = {
      callSessionId,
      tenantId,
      configVersionId,
      configVersion,
      streamSid,
      systemPrompt,
      conversationHistory: [],
      audioBuffer: [],
      isProcessing: false,
      language: voiceSettings?.language ?? 'en-US',
      voiceId: voiceSettings?.voiceId ?? voiceSettings?.tone ?? 'professional',
      voiceTone: voiceSettings?.tone ?? 'professional',
      ws,
      lastActivityAt: Date.now(),
      turnCount: 0,
    };

    activeSessions.set(callSessionId, session);

    await callService.updateCallStatus(tenantId, callSessionId, 'in_progress');

    await callService.logCallEvent({
      tenantId,
      callSessionId,
      eventType: 'call.started',
      actor: 'system',
      payload: { streamSid, language: session.language },
    });

    await sendGreeting(session, aiContext);

    logger.info(
      { tenantId, callSessionId, streamSid },
      'Media stream session initialized',
    );
  } catch (err) {
    logger.error({ err, callSessionId }, 'Failed to initialize media stream session');
    ws.close();
  }
}

async function handleStreamEnd(callSessionId: string): Promise<void> {
  const session = activeSessions.get(callSessionId);
  if (!session) return;

  try {
    if (session.conversationHistory.length > 0) {
      await callService.saveTranscript({
        tenantId: session.tenantId,
        callSessionId,
        fullTranscript: session.conversationHistory.map((turn, i) => ({
          turn: i,
          role: turn.role,
          content: turn.content,
          timestamp: new Date().toISOString(),
        })),
        summary: `Call with ${session.turnCount} turns`,
      });
    }

    await callService.updateCallStatus(session.tenantId, callSessionId, 'completed', {
      endReason: 'caller_hangup',
    });

    await callService.logCallEvent({
      tenantId: session.tenantId,
      callSessionId,
      eventType: 'call.completed',
      actor: 'system',
      payload: { turnCount: session.turnCount },
    });
  } catch (err) {
    logger.error({ err, callSessionId }, 'Error during stream cleanup');
  } finally {
    activeSessions.delete(callSessionId);
  }
}

function handleMediaPayload(callSessionId: string, message: any): void {
  const session = activeSessions.get(callSessionId);
  if (!session) return;

  const audioData = Buffer.from(message.media.payload, 'base64');
  session.audioBuffer.push(audioData);
  session.lastActivityAt = Date.now();
}

async function processBufferedAudio(callSessionId: string): Promise<void> {
  const session = activeSessions.get(callSessionId);
  if (!session || session.isProcessing) return;

  const totalSize = session.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
  if (totalSize < MIN_AUDIO_BUFFER_SIZE) return;

  session.isProcessing = true;

  try {
    const audioInput = Buffer.concat(session.audioBuffer);
    session.audioBuffer = [];

    const turnStart = Date.now();
    const sttStart = Date.now();

    const sttResult = await executeSttWithFailover({
      workloadType: 'stt',
      tenantId: session.tenantId,
      language: session.language,
      sttRequest: {
        audio: audioInput,
        language: session.language || 'en-US',
        tenantId: session.tenantId,
        callSessionId: session.callSessionId,
      },
    });
    const sttMs = Date.now() - sttStart;

    const transcript = sttResult.text.trim();
    if (!transcript) {
      logger.debug({ callSessionId }, 'Skipping empty transcript');
      return;
    }

    const providerKey = await resolveApiKey(session.tenantId, 'openai');
    const ttsSegments: string[] = [];
    let isSynthesizing = false;
    let ttsBuffer = '';
    let responseText = '';
    let ttsMs = 0;

    const drainTtsQueue = async () => {
      if (isSynthesizing) return;
      isSynthesizing = true;

      try {
        while (ttsSegments.length > 0) {
          const nextSegment = ttsSegments.shift();
          if (!nextSegment) continue;

          const ttsStart = Date.now();
          const ttsResult = await executeTtsWithFailover({
            workloadType: 'tts',
            tenantId: session.tenantId,
            language: session.language,
            ttsRequest: {
              text: nextSegment,
              voiceId: session.voiceId || session.voiceTone || 'default',
              language: session.language,
              tenantId: session.tenantId,
              callSessionId: session.callSessionId,
            },
          });
          ttsMs += Date.now() - ttsStart;
          await sendAudioToTwilio(session, ttsResult.audio);
        }
      } finally {
        isSynthesizing = false;
      }
    };

    const waitForTtsDrain = async () => {
      while (isSynthesizing || ttsSegments.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };

    const llmStart = Date.now();

    const llmResult = await streamLlm({
      provider: providerKey.provider,
      apiKey: providerKey.apiKey,
      tenantId: session.tenantId,
      userId: session.tenantId,
      task: 'generate_response',
      payload: {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: session.systemPrompt },
          ...session.conversationHistory.map((turn) => ({
            role: turn.role as 'system' | 'user' | 'assistant',
            content: turn.content,
          })),
          {
            role: 'user',
            content: `Caller speaking live on the phone: ${transcript}\n\nRespond naturally, concisely, and ready for immediate spoken output.`,
          },
        ],
        temperature: 0.5,
        maxTokens: 150,
      },
      onDelta: (delta) => {
        responseText += delta;
        ttsBuffer += delta;
        const { segments, remainder } = extractSpeakableSegments(ttsBuffer);
        ttsBuffer = remainder;
        if (segments.length > 0) {
          ttsSegments.push(...segments);
          void drainTtsQueue();
        }
      },
    });

    const llmMs = llmResult.latencyMs || (Date.now() - llmStart);
    const { segments: trailingSegments, remainder } = extractSpeakableSegments(ttsBuffer, true);
    ttsBuffer = remainder;
    if (trailingSegments.length > 0) {
      ttsSegments.push(...trailingSegments);
      void drainTtsQueue();
    }
    await waitForTtsDrain();

    const finalResponseText = llmResult.response.trim() || responseText.trim();

    session.conversationHistory.push(
      { role: 'user', content: transcript },
      { role: 'assistant', content: finalResponseText },
    );
    session.turnCount++;

    const totalMs = Date.now() - turnStart;

    await callService.logCallEvent({
      tenantId: session.tenantId,
      callSessionId: session.callSessionId,
      eventType: 'conversation.turn',
      actor: 'ai',
      payload: {
        userText: transcript,
        aiText: finalResponseText,
        providers: {
          stt: sttResult.provider,
          llm: llmResult.provider,
          tts: 'streamed',
        },
        turnNumber: session.turnCount,
        streaming: true,
      },
      latencyMs: totalMs,
    });

    logger.info(
      {
        callSessionId,
        turnCount: session.turnCount,
        totalLatencyMs: totalMs,
        sttMs,
        llmMs,
        ttsMs,
        transcript: transcript.substring(0, 100),
      },
      'Voice turn processed with streaming LLM',
    );
  } catch (err) {
    logger.error({ err, callSessionId }, 'Error processing voice turn');

    try {
      await sendErrorMessage(session);
    } catch (ttsErr) {
      logger.error({ err: ttsErr, callSessionId }, 'Failed to send error message');
    }
  } finally {
    session.isProcessing = false;
  }
}

async function sendAudioToTwilio(session: MediaStreamSession, audio: Buffer): Promise<void> {
  if (session.ws.readyState !== WebSocket.OPEN) return;

  const base64Audio = audio.toString('base64');

  const chunkSize = 8000;
  for (let i = 0; i < base64Audio.length; i += chunkSize) {
    const chunk = base64Audio.slice(i, i + chunkSize);

    const mediaMessage = JSON.stringify({
      event: 'media',
      streamSid: session.streamSid,
      media: {
        payload: chunk,
      },
    });

    session.ws.send(mediaMessage);
  }

  const markMessage = JSON.stringify({
    event: 'mark',
    streamSid: session.streamSid,
    mark: {
      name: `turn-${session.turnCount}`,
    },
  });

  session.ws.send(markMessage);
}

async function sendGreeting(session: MediaStreamSession, aiContext: any): Promise<void> {
  try {
    const voiceSettings = aiContext.voiceProfile as any;
    const greeting = voiceSettings?.greeting
      ?? `Thank you for calling ${aiContext.clinicName}. How can I help you today?`;

    const ttsResult = await executeTtsWithFailover({
      workloadType: 'tts',
      tenantId: session.tenantId,
      language: session.language,
      ttsRequest: {
        text: greeting,
        voiceId: session.voiceId || session.voiceTone || 'default',
        language: session.language,
        tenantId: session.tenantId,
      },
    });

    session.conversationHistory.push({
      role: 'assistant',
      content: greeting,
    });

    await sendAudioToTwilio(session, ttsResult.audio);
  } catch (err) {
    logger.error({ err, callSessionId: session.callSessionId }, 'Failed to send greeting');
  }
}

async function sendErrorMessage(session: MediaStreamSession): Promise<void> {
  try {
    const errorText = "I'm sorry, I'm having trouble right now. Let me connect you to the front desk.";

    const ttsResult = await executeTtsWithFailover({
      workloadType: 'tts',
      tenantId: session.tenantId,
      ttsRequest: {
        text: errorText,
        voiceId: session.voiceId || session.voiceTone || 'default',
        language: session.language,
        tenantId: session.tenantId,
      },
    });

    await sendAudioToTwilio(session, ttsResult.audio);
  } catch {
  }
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function getActiveSessionIds(): string[] {
  return Array.from(activeSessions.keys());
}
