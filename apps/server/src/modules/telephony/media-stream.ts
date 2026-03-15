import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { logger } from '../../lib/logger.js';
import * as callService from '../calls/call.service.js';
import { db } from '../../db/index.js';
import { tenantConfigVersions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { resolveApiKey } from '../api-keys/api-key.service.js';
import * as configService from '../config/config.service.js';
import { handleConvaiToolCall } from './convai-tools.js';

interface MediaStreamSession {
  callSessionId: string;
  tenantId: string;
  configVersionId: string;
  configVersion: number;
  streamSid: string;
  ws: WebSocket;
  elevenSocket?: WebSocket;
  elevenReady: boolean;
  conversationId?: string;
  inputFormat?: string;
  outputFormat?: string;
  pendingAudioChunks: string[];
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  lastActivityAt: number;
  turnCount: number;
  firstMediaLogged?: boolean;
  dynamicVariables: Record<string, unknown>;
  contextualUpdate: string;
}

const activeSessions = new Map<string, MediaStreamSession>();
const MAX_PENDING_AUDIO_CHUNKS = 40;
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000;

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const truncate = (value: string, max = 800): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
};

const formatBusinessHours = (hours?: Record<string, { start: string; end: string } | null>): string => {
  if (!hours) return '';
  const lines = WEEKDAYS.map((day) => {
    const slot = hours[day];
    if (!slot) return `${day}: closed`;
    return `${day}: ${slot.start}-${slot.end}`;
  });
  return lines.join('; ');
};

const formatServices = (services: Array<{ serviceName?: string; durationMinutes?: number; price?: string }>): string => {
  if (!services.length) return '';
  const lines = services.slice(0, 12).map((service) => {
    const parts = [service.serviceName];
    if (service.durationMinutes) parts.push(`${service.durationMinutes} min`);
    if (service.price) parts.push(`$${service.price}`);
    return parts.filter(Boolean).join(' - ');
  });
  return truncate(lines.join(' | '), 1000);
};

const formatPolicies = (policies: Array<{ policyType?: string; content?: string }>): string => {
  if (!policies.length) return '';
  const lines = policies.slice(0, 8).map((policy) => {
    const label = policy.policyType ? `${policy.policyType}: ` : '';
    return `${label}${policy.content ?? ''}`.trim();
  });
  return truncate(lines.join(' | '), 1200);
};

const formatFaqs = (faqs: Array<{ question?: string; answer?: string }>): string => {
  if (!faqs.length) return '';
  const lines = faqs.slice(0, 8).map((faq) => {
    if (!faq.question && !faq.answer) return '';
    return `Q: ${faq.question ?? ''} A: ${faq.answer ?? ''}`.trim();
  }).filter(Boolean);
  return truncate(lines.join(' | '), 1200);
};

const formatEmergencyInfo = (policies: Array<{ emergencyDisclaimer?: string | null }>): string => {
  const disclaimers = policies
    .map((policy) => policy.emergencyDisclaimer?.trim())
    .filter(Boolean);
  return truncate(disclaimers.join(' | '), 800);
};

const formatEscalationInfo = (policies: Array<{ escalationConditions?: { type?: string; content?: string } | null }>): string => {
  const lines = policies
    .map((policy) => policy.escalationConditions)
    .filter((entry): entry is { type?: string; content?: string } => Boolean(entry))
    .map((entry) => {
      const label = entry.type ? `${entry.type}: ` : '';
      return `${label}${entry.content ?? ''}`.trim();
    })
    .filter(Boolean);
  return truncate(lines.join(' | '), 800);
};

const formatBookingRules = (rules?: {
  defaultAppointmentDurationMinutes?: number | null;
  bufferBetweenAppointmentsMinutes?: number | null;
  minNoticePeriodHours?: number | null;
  maxAdvanceBookingDays?: number | null;
  closedDates?: string[] | null;
} | null): string => {
  if (!rules) return '';
  const parts = [
    rules.defaultAppointmentDurationMinutes ? `default ${rules.defaultAppointmentDurationMinutes} min` : null,
    rules.bufferBetweenAppointmentsMinutes ? `buffer ${rules.bufferBetweenAppointmentsMinutes} min` : null,
    rules.minNoticePeriodHours ? `min notice ${rules.minNoticePeriodHours} hrs` : null,
    rules.maxAdvanceBookingDays ? `max advance ${rules.maxAdvanceBookingDays} days` : null,
    rules.closedDates?.length ? `closed dates: ${rules.closedDates.length}` : null,
  ].filter(Boolean);
  return parts.join('; ');
};

const buildContextualUpdate = (input: {
  agentName?: string;
  todayDate?: string;
  currentYear?: string;
  clinicName?: string;
  staffDirectory?: string;
  clinicNotes?: string;
}): string => {
  const lines = [
    'Context update for the receptionist:',
    input.agentName ? `Agent name: ${input.agentName}` : null,
    input.todayDate ? `Today (clinic timezone): ${input.todayDate}` : null,
    input.currentYear ? `Current year (clinic timezone): ${input.currentYear}` : null,
    input.clinicName ? `Clinic name: ${input.clinicName}` : null,
    input.staffDirectory ? `Staff directory: ${input.staffDirectory}` : null,
    input.clinicNotes ? `Clinic notes: ${input.clinicNotes}` : null,
    'Instructions:',
    input.agentName
      ? `- Always introduce yourself as ${input.agentName}. Never use any other name.`
      : '- Always introduce yourself as the receptionist name provided by the clinic.',
    '- When the caller gives a date without a year, always assume the current year shown above.',
    '- If that date already passed in the current year, use the next year.',
    '- Use the staff directory when asked about staff names, roles, phone numbers, or status.',
    '- If asked to connect to a staff member and their phone is listed, say you are forwarding the call to that phone (simulation in test).',
    '- Do not refuse to share staff names if they are listed in the staff directory.',
    '- If an answer is in the uploaded context, use it directly.',
  ].filter(Boolean);

  return lines.join('\n');
};

async function buildConvaiContext(tenantId: string) {
  const [clinic, services, policies, faqs, bookingRules, voiceProfile] = await Promise.all([
    configService.getClinicProfile(tenantId),
    configService.getServices(tenantId),
    configService.getPolicies(tenantId),
    configService.getFaqs(tenantId),
    configService.getBookingRules(tenantId),
    configService.getVoiceProfile(tenantId),
  ]);

  const contextDocs = (policies ?? [])
    .flatMap((policy: any) => Array.isArray(policy?.sensitiveTopics) ? policy.sensitiveTopics : [])
    .filter((topic: any) => topic?.type === 'context_document');

  const staffDirectory = contextDocs.find((doc: any) => doc?.title === 'Staff Directory')?.content ?? '';
  const clinicNotes = contextDocs.find((doc: any) => doc?.title === 'Clinic Notes')?.content ?? '';

  const normalizedBookingRules = bookingRules
    ? {
        ...bookingRules,
        closedDates: Array.isArray(bookingRules.closedDates)
          ? bookingRules.closedDates.filter((value: unknown): value is string => typeof value === 'string')
          : null,
      }
    : null;

  const clinicTimezone = clinic?.timezone ?? 'UTC';
  const todayDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: clinicTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const currentYear = todayDate.slice(0, 4);

  const dynamicVariables = {
    agent_name: 'Receptionist',
    clinic_name: clinic?.clinicName ?? 'DentalFlow Clinic',
    clinic_phone: clinic?.phone ?? clinic?.primaryPhone ?? 'Unknown',
    clinic_email: clinic?.email ?? clinic?.supportEmail ?? 'Unknown',
    clinic_address: clinic?.address ?? 'Unknown',
    clinic_website: clinic?.website ?? 'Unknown',
    clinic_timezone: clinicTimezone,
    today_date: todayDate,
    current_year: currentYear,
    clinic_description: clinic?.description ?? '',
    clinic_specialties: Array.isArray(clinic?.specialties) ? clinic.specialties.join(', ') : '',
    business_hours: formatBusinessHours(clinic?.businessHours as any),
    services_list: formatServices((services ?? []) as any),
    policies_list: formatPolicies((policies ?? []) as any),
    faqs_list: formatFaqs((faqs ?? []) as any),
    booking_rules: formatBookingRules(normalizedBookingRules),
    voice_tone: voiceProfile?.tone ?? '',
    voice_language: voiceProfile?.language ?? '',
    voice_id: voiceProfile?.voiceId ?? '',
    greeting_message: voiceProfile?.greetingMessage ?? '',
    after_hours_message: voiceProfile?.afterHoursMessage ?? '',
    hold_music: voiceProfile?.holdMusic ?? '',
    emergency_disclaimer: formatEmergencyInfo((policies ?? []) as any),
    escalation_conditions: formatEscalationInfo((policies ?? []) as any),
    staff_directory: String(staffDirectory ?? ''),
    clinic_notes: String(clinicNotes ?? ''),
  } as Record<string, unknown>;

  const contextualUpdate = buildContextualUpdate({
    agentName: dynamicVariables.agent_name as string,
    todayDate,
    currentYear,
    clinicName: dynamicVariables.clinic_name as string,
    staffDirectory: String(staffDirectory ?? ''),
    clinicNotes: String(clinicNotes ?? ''),
  });

  return { dynamicVariables, contextualUpdate, voiceProfile };
}

async function createConvaiWebSocket(session: MediaStreamSession, agentId: string): Promise<WebSocket> {
  const { apiKey } = await resolveApiKey(session.tenantId, 'elevenlabs');
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    {
      headers: {
        'xi-api-key': apiKey,
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ElevenLabs signed URL error: ${response.status} ${errorBody}`);
  }

  logger.info(
    { tenantId: session.tenantId, callSessionId: session.callSessionId, agentId },
    'ElevenLabs signed URL created',
  );

  const payload = await response.json() as { signed_url?: string };
  if (!payload.signed_url) {
    throw new Error('ElevenLabs signed URL response missing signed_url');
  }

  const socket = new WebSocket(payload.signed_url, ['convai']);

  socket.on('open', () => {
    const initPayload = {
      type: 'conversation_initiation_client_data',
      dynamic_variables: session.dynamicVariables,
    };
    socket.send(JSON.stringify(initPayload));
    logger.info(
      { tenantId: session.tenantId, callSessionId: session.callSessionId },
      'ElevenLabs conversation initiated',
    );
  });

  return socket;
}

export function attachMediaStreamWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({
    noServer: true,
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const callSessionId = url.pathname.split('/').pop() || '';

    logger.info(
      {
        callSessionId,
        remoteAddress: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      },
      'Media stream WebSocket connected',
    );

    let sessionInitialized = false;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.event) {
          case 'connected':
            logger.info({ callSessionId, protocol: message.protocol }, 'Twilio media stream connected');
            break;

          case 'start':
            await handleStreamStart(ws, callSessionId, message);
            sessionInitialized = true;
            break;

          case 'media':
            if (!sessionInitialized) break;
            handleMediaPayload(callSessionId, message);
            break;

          case 'stop':
            logger.info({ callSessionId }, 'Twilio media stream stopped');
            await handleStreamEnd(callSessionId, 'caller_hangup');
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

    ws.on('close', async (code, reason) => {
      await handleStreamEnd(callSessionId, 'caller_hangup');
      logger.info(
        { callSessionId, code, reason: reason?.toString() },
        'Media stream WebSocket closed',
      );
    });

    ws.on('error', (err) => {
      logger.error({ err, callSessionId }, 'Media stream WebSocket error');
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url || '', `http://${req.headers.host}`);
    if (!requestUrl.pathname.startsWith('/api/telephony/media-stream/')) {
      return;
    }

    logger.info(
      { path: requestUrl.pathname, remoteAddress: req.socket.remoteAddress },
      'Upgrading request to media stream WebSocket',
    );
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
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
  logger.info(
    {
      callSessionId,
      streamSid,
      callSid: startData?.callSid,
      accountSid: startData?.accountSid,
      mediaFormat: startData?.mediaFormat,
      tracks: startData?.tracks,
    },
    'Twilio media stream start received',
  );

  try {
    const customParameters = startData?.customParameters || {};
    const tenantId = customParameters.tenantId;
    const configVersionId = customParameters.configVersionId;

    if (!tenantId || !configVersionId) {
      logger.error(
        { callSessionId, customParameters },
        'Missing tenantId or configVersionId in stream start',
      );
      ws.close();
      return;
    }

    const [cvRow] = await db
      .select({ version: tenantConfigVersions.version })
      .from(tenantConfigVersions)
      .where(eq(tenantConfigVersions.id, configVersionId))
      .limit(1);

    const configVersion = cvRow?.version ?? 1;
    const { dynamicVariables, contextualUpdate, voiceProfile } = await buildConvaiContext(tenantId);

    const session: MediaStreamSession = {
      callSessionId,
      tenantId,
      configVersionId,
      configVersion,
      streamSid,
      ws,
      elevenReady: false,
      pendingAudioChunks: [],
      conversationHistory: [],
      lastActivityAt: Date.now(),
      turnCount: 0,
      dynamicVariables,
      contextualUpdate,
    };

    activeSessions.set(callSessionId, session);
    logger.info(
      { callSessionId, tenantId, configVersionId, configVersion },
      'Media stream session stored in memory',
    );

    await callService.updateCallStatus(tenantId, callSessionId, 'in_progress');

    await callService.logCallEvent({
      tenantId,
      callSessionId,
      eventType: 'call.started',
      actor: 'system',
      payload: { streamSid },
    });

    const agentId = (voiceProfile as any)?.voiceAgentId as string | undefined;
    if (!agentId) {
      logger.error({ tenantId, callSessionId }, 'No ElevenLabs agent ID configured for tenant');
      ws.close();
      return;
    }

    const elevenSocket = await createConvaiWebSocket(session, agentId);
    session.elevenSocket = elevenSocket;

    elevenSocket.on('message', (data) => {
      logger.debug({ callSessionId, length: data.toString().length }, 'ElevenLabs message received');
      handleElevenLabsMessage(session, data.toString()).catch((err) => {
        logger.error({ err, callSessionId }, 'Failed to handle ElevenLabs message');
      });
    });

    elevenSocket.on('close', () => {
      logger.info({ callSessionId }, 'ElevenLabs WebSocket closed');
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    elevenSocket.on('error', (err) => {
      logger.error({ err, callSessionId }, 'ElevenLabs WebSocket error');
    });

    logger.info(
      { tenantId, callSessionId, streamSid },
      'Media stream session initialized',
    );
  } catch (err) {
    logger.error({ err, callSessionId }, 'Failed to initialize media stream session');
    ws.close();
  }
}

async function handleElevenLabsMessage(session: MediaStreamSession, raw: string): Promise<void> {
  let message: any;
  try {
    message = JSON.parse(raw);
  } catch (error) {
    logger.debug({ raw }, 'Ignoring non-JSON ElevenLabs message');
    return;
  }

  switch (message.type) {
    case 'conversation_initiation_metadata': {
      const meta = message.conversation_initiation_metadata_event || {};
      session.conversationId = meta.conversation_id;
      session.inputFormat = meta.user_input_audio_format;
      session.outputFormat = meta.agent_output_audio_format;
      session.elevenReady = true;

      if (session.inputFormat !== 'ulaw_8000' || session.outputFormat !== 'ulaw_8000') {
        logger.error(
          {
            callSessionId: session.callSessionId,
            inputFormat: session.inputFormat,
            outputFormat: session.outputFormat,
          },
          'Unsupported ElevenLabs audio format for Twilio media stream',
        );
        await handleStreamEnd(session.callSessionId, 'audio_format_mismatch');
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.close();
        }
        if (session.elevenSocket?.readyState === WebSocket.OPEN) {
          session.elevenSocket.close();
        }
        return;
      }

      if (session.contextualUpdate && session.elevenSocket?.readyState === WebSocket.OPEN) {
        logger.info(
          { callSessionId: session.callSessionId },
          'Sending contextual update to ElevenLabs',
        );
        session.elevenSocket.send(JSON.stringify({
          type: 'contextual_update',
          text: session.contextualUpdate,
        }));
      }

      flushPendingAudio(session);
      break;
    }
    case 'audio': {
      const audioBase64 = message.audio_event?.audio_base_64 as string | undefined;
      if (!audioBase64) return;
      logger.debug(
        { callSessionId: session.callSessionId, chunkSize: audioBase64.length },
        'Received audio from ElevenLabs',
      );
      sendAudioToTwilio(session, audioBase64);
      break;
    }
    case 'interruption': {
      logger.info({ callSessionId: session.callSessionId }, 'ElevenLabs interruption received');
      sendClearToTwilio(session);
      break;
    }
    case 'user_transcript': {
      const text = message.user_transcription_event?.user_transcript as string | undefined;
      if (!text) return;
      logger.info(
        { callSessionId: session.callSessionId, text: truncate(text, 200) },
        'User transcript received',
      );
      session.conversationHistory.push({
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      });
      session.turnCount += 1;
      await callService.logCallEvent({
        tenantId: session.tenantId,
        callSessionId: session.callSessionId,
        eventType: 'conversation.message',
        actor: 'user',
        payload: { text },
      });
      break;
    }
    case 'agent_response': {
      const text = message.agent_response_event?.agent_response as string | undefined;
      if (!text) return;
      logger.info(
        { callSessionId: session.callSessionId, text: truncate(text, 200) },
        'Agent response received',
      );
      session.conversationHistory.push({
        role: 'assistant',
        content: text,
        timestamp: new Date().toISOString(),
      });
      await callService.logCallEvent({
        tenantId: session.tenantId,
        callSessionId: session.callSessionId,
        eventType: 'conversation.message',
        actor: 'ai',
        payload: { text },
      });
      break;
    }
    case 'client_tool_call': {
      const toolCall = message.client_tool_call || {};
      const toolName = toolCall.tool_name as string | undefined;
      const toolCallId = toolCall.tool_call_id as string | undefined;
      const params = toolCall.parameters || {};
      if (!toolName || !toolCallId || !session.elevenSocket) return;

      try {
        const result = await handleConvaiToolCall({
          tenantId: session.tenantId,
          toolName,
          params,
        });
        logger.info(
          { callSessionId: session.callSessionId, toolName },
          'Tool call handled successfully',
        );
        session.elevenSocket.send(JSON.stringify({
          type: 'client_tool_result',
          tool_call_id: toolCallId,
          result: typeof result === 'string' ? result : JSON.stringify(result),
          is_error: false,
        }));
      } catch (error) {
        logger.error(
          { callSessionId: session.callSessionId, toolName, error },
          'Tool call failed',
        );
        const messageText = error instanceof Error ? error.message : String(error);
        session.elevenSocket.send(JSON.stringify({
          type: 'client_tool_result',
          tool_call_id: toolCallId,
          result: messageText,
          is_error: true,
        }));
      }
      break;
    }
    case 'agent_tool_response': {
      const toolName = message.agent_tool_response?.tool_name;
      if (toolName === 'end_call') {
        logger.info({ callSessionId: session.callSessionId }, 'Agent requested end_call');
        await handleStreamEnd(session.callSessionId, 'agent_ended_call');
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.close();
        }
      }
      break;
    }
    default:
      break;
  }
}

function handleMediaPayload(callSessionId: string, message: any): void {
  const session = activeSessions.get(callSessionId);
  if (!session) {
    logger.warn({ callSessionId }, 'Media payload for unknown session');
    return;
  }

  const audioChunk = message.media?.payload as string | undefined;
  if (!audioChunk) return;

  session.lastActivityAt = Date.now();
  if (!session.firstMediaLogged) {
    session.firstMediaLogged = true;
    logger.info(
      { callSessionId, streamSid: session.streamSid, chunkSize: audioChunk.length },
      'First media chunk received',
    );
  }

  if (session.elevenReady && session.elevenSocket?.readyState === WebSocket.OPEN) {
    session.elevenSocket.send(JSON.stringify({ user_audio_chunk: audioChunk }));
    return;
  }

  if (session.pendingAudioChunks.length >= MAX_PENDING_AUDIO_CHUNKS) {
    session.pendingAudioChunks.shift();
  }
  session.pendingAudioChunks.push(audioChunk);
  logger.debug(
    { callSessionId, pending: session.pendingAudioChunks.length },
    'Buffered media chunk awaiting ElevenLabs readiness',
  );
}

function flushPendingAudio(session: MediaStreamSession): void {
  if (!session.elevenSocket || session.elevenSocket.readyState !== WebSocket.OPEN) return;
  for (const chunk of session.pendingAudioChunks) {
    session.elevenSocket.send(JSON.stringify({ user_audio_chunk: chunk }));
  }
  logger.info(
    { callSessionId: session.callSessionId, flushed: session.pendingAudioChunks.length },
    'Flushed pending audio chunks to ElevenLabs',
  );
  session.pendingAudioChunks = [];
}

function sendAudioToTwilio(session: MediaStreamSession, audioBase64: string): void {
  if (session.ws.readyState !== WebSocket.OPEN) return;

  const chunkSize = 8000;
  let chunkCount = 0;
  for (let i = 0; i < audioBase64.length; i += chunkSize) {
    const chunk = audioBase64.slice(i, i + chunkSize);
    const mediaMessage = JSON.stringify({
      event: 'media',
      streamSid: session.streamSid,
      media: { payload: chunk },
    });
    session.ws.send(mediaMessage);
    chunkCount += 1;
  }
  logger.debug(
    { callSessionId: session.callSessionId, chunkCount },
    'Sent audio chunks to Twilio',
  );
}

function sendClearToTwilio(session: MediaStreamSession): void {
  if (session.ws.readyState !== WebSocket.OPEN) return;
  session.ws.send(JSON.stringify({
    event: 'clear',
    streamSid: session.streamSid,
  }));
}

async function handleStreamEnd(callSessionId: string, endReason: string): Promise<void> {
  const session = activeSessions.get(callSessionId);
  if (!session) return;

  try {
    logger.info(
      { callSessionId, tenantId: session.tenantId, endReason },
      'Twilio media stream ending',
    );
    if (session.conversationHistory.length > 0) {
      await callService.saveTranscript({
        tenantId: session.tenantId,
        callSessionId,
        fullTranscript: session.conversationHistory.map((turn, i) => ({
          turn: i,
          role: turn.role,
          content: turn.content,
          timestamp: turn.timestamp,
        })),
        summary: `Call with ${session.turnCount} turns`,
      });
    }

    await callService.updateCallStatus(session.tenantId, callSessionId, 'completed', {
      endReason,
    });

    await callService.logCallEvent({
      tenantId: session.tenantId,
      callSessionId,
      eventType: 'call.completed',
      actor: 'system',
      payload: { turnCount: session.turnCount, endReason },
    });
  } catch (err) {
    logger.error({ err, callSessionId }, 'Error during stream cleanup');
  } finally {
    try {
      if (session.elevenSocket?.readyState === WebSocket.OPEN) {
        session.elevenSocket.close();
      }
    } catch {
      // ignore
    }
    activeSessions.delete(callSessionId);
  }
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function getActiveSessionIds(): string[] {
  return Array.from(activeSessions.keys());
}

setInterval(() => {
  const now = Date.now();
  for (const [callSessionId, session] of activeSessions.entries()) {
    if (now - session.lastActivityAt > MAX_SESSION_DURATION_MS) {
      handleStreamEnd(callSessionId, 'session_timeout').catch((err) => {
        logger.error({ err, callSessionId }, 'Failed to close timed-out session');
      });
    }
  }
}, 60_000);
