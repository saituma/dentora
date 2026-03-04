
import { db } from '../../db/index.js';
import { tenantConfigVersions, voiceProfile, faqLibrary, services, policies, bookingRules, clinicProfile } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { cache } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { ConfigNotFoundError, ProviderError } from '../../lib/errors.js';
import { executeLlmWithFailover, type SelectionResult } from './engine/index.js';
import type { LlmMessage } from './providers/base.js';

export interface TenantAIContext {
  tenantId: string;
  configVersion: number;
  clinicName: string;
  clinic: Record<string, unknown>;
  services: Record<string, unknown>[];
  bookingRules: Record<string, unknown>;
  policies: Record<string, unknown>[];
  voiceProfile: Record<string, unknown>;
  faqs: Record<string, unknown>[];
}

export async function loadTenantAIContext(
  tenantId: string,
  configVersion: number,
): Promise<TenantAIContext> {
  const cacheKey = `ai-context:v${configVersion}`;
  const cached = await cache.getTenantScoped(tenantId, 'ai', cacheKey);
  if (cached) return JSON.parse(cached);

  const [configVersionRow] = await db
    .select()
    .from(tenantConfigVersions)
    .where(
      and(
        eq(tenantConfigVersions.tenantId, tenantId),
        eq(tenantConfigVersions.version, configVersion),
      ),
    )
    .limit(1);

  if (!configVersionRow) {
    throw new ConfigNotFoundError(tenantId, configVersion);
  }

  const [clinic] = await db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1);
  const tenantServices = await db.select().from(services).where(eq(services.tenantId, tenantId));
  const [booking] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);
  const tenantPolicies = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  const [voice] = await db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1);
  const faqs = await db.select().from(faqLibrary).where(eq(faqLibrary.tenantId, tenantId));

  const context: TenantAIContext = {
    tenantId,
    configVersion,
    clinicName: clinic?.clinicName ?? 'Dental Clinic',
    clinic: clinic ?? {},
    services: tenantServices,
    bookingRules: booking ?? {},
    policies: tenantPolicies,
    voiceProfile: voice ?? {},
    faqs,
  };

  await cache.setTenantScoped(tenantId, 'ai', cacheKey, JSON.stringify(context), 3600);

  return context;
}

export function buildSystemPrompt(context: TenantAIContext): string {
  const { clinicName, clinic, services: svcList, bookingRules: booking, policies: policyList, voiceProfile: voice, faqs } = context;

  const voiceSettings = voice as any;
  const tone = voiceSettings?.tone ?? 'professional';
  const language = voiceSettings?.language ?? 'en-US';
  const greeting = voiceSettings?.greeting ?? `Thank you for calling ${clinicName}. How can I help you today?`;

  let prompt = `You are an AI dental receptionist for ${clinicName}.\n`;
  prompt += `Tone: ${tone}. Language: ${language}.\n`;
  prompt += `Greeting: "${greeting}"\n\n`;

  const clinicData = clinic as any;
  if (clinicData?.address) {
    prompt += `Clinic Address: ${clinicData.address}\n`;
  }
  if (clinicData?.phone) {
    prompt += `Clinic Phone: ${clinicData.phone}\n`;
  }
  if (clinicData?.operatingHours) {
    prompt += `Operating Hours: ${JSON.stringify(clinicData.operatingHours)}\n`;
  }
  prompt += '\n';

  if (svcList.length > 0) {
    prompt += 'Available Services:\n';
    for (const svc of svcList) {
      const s = svc as any;
      prompt += `- ${s.serviceName}: ${s.description ?? 'No description'}`;
      if (s.durationMinutes) prompt += ` (${s.durationMinutes} min)`;
      if (s.price) prompt += ` - $${s.price}`;
      prompt += '\n';
    }
    prompt += '\n';
  }

  const bookingData = booking as any;
  if (bookingData?.advanceBookingDays) {
    prompt += `Booking: Appointments can be scheduled up to ${bookingData.advanceBookingDays} days in advance.\n`;
  }
  if (bookingData?.cancellationHours) {
    prompt += `Cancellation: ${bookingData.cancellationHours} hours notice required.\n`;
  }
  prompt += '\n';

  if (policyList.length > 0) {
    prompt += 'Policies:\n';
    for (const p of policyList) {
      const policy = p as any;
      prompt += `- ${policy.policyType}: ${policy.content}\n`;
    }
    prompt += '\n';
  }

  if (faqs.length > 0) {
    prompt += 'Frequently Asked Questions:\n';
    for (const faq of faqs) {
      const f = faq as any;
      prompt += `Q: ${f.question}\nA: ${f.answer}\n\n`;
    }
  }

  prompt += `\nIMPORTANT RULES:
- Never provide medical advice or diagnoses.
- If the caller has a dental emergency, advise them to go to the nearest emergency room.
- If you don't know the answer, offer to have the clinic call them back.
- Always confirm appointment details before booking.
- Be concise in verbal responses as this is a phone conversation.
- If the caller asks to speak to a human, transfer them to the clinic's main line.
`;

  return prompt;
}

export async function processConversationTurn(input: {
  tenantId: string;
  callSessionId: string;
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  userMessage: string;
}): Promise<{
  response: string;
  provider: string;
  latencyMs: number;
  tokensUsed: number;
  selection: SelectionResult;
}> {
  logger.info(
    { tenantId: input.tenantId, callSessionId: input.callSessionId },
    'Processing conversation turn',
  );

  const messages: LlmMessage[] = [
    { role: 'system', content: input.systemPrompt },
    ...input.conversationHistory.map((m) => ({
      role: m.role as LlmMessage['role'],
      content: m.content,
    })),
    { role: 'user', content: input.userMessage },
  ];

  const result = await executeLlmWithFailover({
    workloadType: 'llm',
    tenantId: input.tenantId,
    maxLatencyMs: 5000,
    minReliability: 0.9,
    llmRequest: {
      model: 'gpt-4o-mini',
      tenantId: input.tenantId,
      messages,
      temperature: 0.7,
      maxTokens: 500,
      callSessionId: input.callSessionId,
    },
  });

  logger.info(
    {
      tenantId: input.tenantId,
      callSessionId: input.callSessionId,
      provider: result.selectionResult.providerName,
      latencyMs: result.latencyMs,
      tokensUsed: result.inputTokens + result.outputTokens,
      fallbackCount: result.selectionResult.fallbackCount,
    },
    'Conversation turn completed',
  );

  return {
    response: result.content,
    provider: result.provider,
    latencyMs: result.latencyMs,
    tokensUsed: result.inputTokens + result.outputTokens,
    selection: result.selectionResult,
  };
}

export async function processVoiceTurn(input: {
  tenantId: string;
  callSessionId: string;
  systemPrompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  audioInput: Buffer;
  language?: string;
  voiceTone?: string;
}): Promise<{
  audioOutput: Buffer;
  transcript: string;
  responseText: string;
  providers: { stt: string; llm: string; tts: string };
  latency: { sttMs: number; llmMs: number; ttsMs: number; totalMs: number };
}> {
  const totalStart = Date.now();

  const { executeSttWithFailover, executeTtsWithFailover } = await import('./engine/index.js');

  const sttResult = await executeSttWithFailover({
    workloadType: 'stt',
    tenantId: input.tenantId,
    language: input.language,
    sttRequest: {
      audio: input.audioInput,
      language: input.language || 'en-US',
      tenantId: input.tenantId,
    },
  });

  const llmResult = await processConversationTurn({
    tenantId: input.tenantId,
    callSessionId: input.callSessionId,
    systemPrompt: input.systemPrompt,
    conversationHistory: input.conversationHistory,
    userMessage: sttResult.text,
  });

  const ttsResult = await executeTtsWithFailover({
    workloadType: 'tts',
    tenantId: input.tenantId,
    language: input.language,
    ttsRequest: {
      text: llmResult.response,
      voiceId: input.voiceTone || 'default',
      language: input.language || 'en-US',
      tenantId: input.tenantId,
    },
  });

  const totalMs = Date.now() - totalStart;

  logger.info(
    {
      tenantId: input.tenantId,
      callSessionId: input.callSessionId,
      sttProvider: sttResult.provider,
      llmProvider: llmResult.provider,
      ttsProvider: ttsResult.provider,
      totalMs,
    },
    'Voice turn completed (STT → LLM → TTS)',
  );

  return {
    audioOutput: ttsResult.audio,
    transcript: sttResult.text,
    responseText: llmResult.response,
    providers: {
      stt: sttResult.provider,
      llm: llmResult.provider,
      tts: ttsResult.provider,
    },
    latency: {
      sttMs: sttResult.latencyMs,
      llmMs: llmResult.latencyMs,
      ttsMs: ttsResult.latencyMs,
      totalMs,
    },
  };
}
