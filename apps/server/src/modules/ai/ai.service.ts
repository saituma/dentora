
import { db } from '../../db/index.js';
import { tenantConfigVersions, voiceProfile, faqLibrary, services, policies, bookingRules, clinicProfile } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { cache } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { ConfigNotFoundError } from '../../lib/errors.js';
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

type PromptEnvironment = 'phone' | 'sidebar-test';

type ScheduleEntry = {
  start?: string;
  end?: string;
  breakStart?: string;
  breakEnd?: string;
  breaks?: Array<{ start?: string; end?: string }>;
} | null;

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const LEGACY_DEFAULT_GREETINGS = new Set([
  'hi, thank you for calling. how can i help you today?',
  'hello, thank you for calling. how can i help you today?',
  'hello, thank you for calling. how may i help you today?',
]);

function normalizeGreetingMessage(clinicName: string, greetingMessage?: string | null): string | null {
  const normalized = String(greetingMessage ?? '').trim();
  if (!normalized) {
    return `Hi, welcome to ${clinicName}, what can I help you with today?`;
  }

  const comparable = normalized.toLowerCase().replace(/\s+/g, ' ');
  if (LEGACY_DEFAULT_GREETINGS.has(comparable)) {
    return `Hi, welcome to ${clinicName}, what can I help you with today?`;
  }

  return normalized;
}

function formatScheduleValue(schedule?: Record<string, unknown> | null): string {
  if (!schedule || typeof schedule !== 'object') return 'Not provided';

  const lines = Object.entries(schedule)
    .map(([rawDay, rawValue]) => {
      const day = DAY_LABELS[rawDay.toLowerCase()] ?? rawDay;
      if (!rawValue || typeof rawValue !== 'object') return `${day}: Closed`;

      const entry = rawValue as ScheduleEntry;
      if (!entry?.start || !entry?.end) return `${day}: Closed`;
      const firstBreak = Array.isArray(entry.breaks) && entry.breaks.length > 0
        ? entry.breaks[0]
        : entry.breakStart && entry.breakEnd
          ? { start: entry.breakStart, end: entry.breakEnd }
          : null;
      const breakLabel = firstBreak?.start && firstBreak?.end
        ? ` (break ${firstBreak.start}-${firstBreak.end})`
        : '';
      return `${day}: ${entry.start}-${entry.end}${breakLabel}`;
    })
    .filter(Boolean);

  return lines.length > 0 ? lines.join('; ') : 'Not provided';
}

function formatServicesForPrompt(
  serviceList: Record<string, unknown>[],
): string {
  if (serviceList.length === 0) return 'Not provided';

  return serviceList
    .map((service) => {
      const svc = service as {
        serviceName?: string;
        durationMinutes?: number;
        price?: string | number;
        description?: string;
      };

      const details = [
        svc.durationMinutes ? `${svc.durationMinutes} min` : null,
        svc.price ? `$${svc.price}` : null,
        svc.description?.trim() || null,
      ].filter(Boolean);

      return details.length > 0
        ? `${svc.serviceName ?? 'Service'} (${details.join(', ')})`
        : (svc.serviceName ?? 'Service');
    })
    .join('; ');
}

function formatContactInfo(clinic: Record<string, unknown>): string {
  const clinicData = clinic as {
    phone?: string;
    primaryPhone?: string;
    email?: string;
    supportEmail?: string;
    website?: string;
    address?: string;
  };

  const items = [
    clinicData.phone || clinicData.primaryPhone ? `Phone: ${clinicData.phone || clinicData.primaryPhone}` : null,
    clinicData.email || clinicData.supportEmail ? `Email: ${clinicData.email || clinicData.supportEmail}` : null,
    clinicData.website ? `Website: ${clinicData.website}` : null,
    clinicData.address ? `Address: ${clinicData.address}` : null,
  ].filter(Boolean);

  return items.length > 0 ? items.join('; ') : 'Not provided';
}

function formatClinicDescriptionForPrompt(clinic: Record<string, unknown>): string {
  const d = clinic.description;
  return typeof d === 'string' && d.trim() ? d.trim() : 'Not provided';
}

/** Avoid embedding base64 image payloads in LLM prompts. */
function formatClinicLogoForPrompt(clinic: Record<string, unknown>): string {
  const raw = clinic.logo;
  if (typeof raw !== 'string' || !raw.trim()) return 'Not provided';
  if (raw.startsWith('data:image')) return 'Provided (clinic image on file)';
  return `Logo URL: ${raw.trim()}`;
}

function formatBookableStaffForPrompt(clinic: Record<string, unknown>): string {
  const raw = clinic.staffMembers;
  if (!Array.isArray(raw) || raw.length === 0) {
    return 'Not configured — add providers under Dashboard → Staff.';
  }
  const lines = raw
    .map((row) => row as { name?: string; role?: string; acceptsAppointments?: boolean })
    .filter((row) => typeof row.name === 'string' && row.name.trim().length > 0)
    .filter((row) => row.acceptsAppointments !== false)
    .map((row) => {
      const role = typeof row.role === 'string' && row.role.trim() ? row.role.trim() : 'Staff';
      return `${row.name!.trim()} (${role})`;
    });
  return lines.length > 0 ? lines.join('; ') : 'No staff marked for appointments — enable in Dashboard → Staff.';
}

function formatPromotionsForPrompt(policyList: Record<string, unknown>[]): string {
  const promotions = policyList
    .map((policy) => policy as { policyType?: string; content?: string })
    .filter((policy) => {
      const type = policy.policyType?.toLowerCase() ?? '';
      return ['promotion', 'promotions', 'offer', 'special', 'announcement', 'update'].some((token) =>
        type.includes(token),
      );
    })
    .map((policy) => policy.content?.trim())
    .filter((value): value is string => Boolean(value));

  return promotions.length > 0 ? promotions.join('; ') : 'Not provided';
}

function formatUploadedContextForPrompt(policyList: Record<string, unknown>[]): string {
  const contextChunks = policyList
    .flatMap((policy) => {
      const rawTopics = (policy as { sensitiveTopics?: unknown }).sensitiveTopics;
      return Array.isArray(rawTopics) ? rawTopics : [];
    })
    .map((topic) => topic as { type?: string; title?: string; content?: string })
    .filter((topic) => topic.type === 'context_document' && typeof topic.content === 'string' && topic.content.trim())
    .map((topic) => {
      const title = topic.title?.trim() || 'Uploaded context';
      return `${title}:\n${topic.content!.trim()}`;
    });

  return contextChunks.length > 0 ? contextChunks.join('\n---\n') : 'None provided';
}

function buildPromptContextBlock(context: TenantAIContext): string[] {
  const clinicData = context.clinic as {
    clinicName?: string;
    timezone?: string;
    businessHours?: Record<string, unknown>;
  };
  const bookingData = context.bookingRules as {
    operatingSchedule?: Record<string, unknown>;
    defaultAppointmentDurationMinutes?: number;
    minNoticePeriodHours?: number;
    maxAdvanceBookingDays?: number;
    closedDates?: string[];
  };
  const voiceData = context.voiceProfile as {
    greetingMessage?: string;
    greeting?: string;
    tone?: string;
  };

  const officeHours = formatScheduleValue(
    clinicData.businessHours ?? bookingData.operatingSchedule ?? null,
  );
  const uploadedContext = formatUploadedContextForPrompt(context.policies);
  const faqSummary = context.faqs.length > 0
    ? context.faqs
      .map((faq) => faq as { question?: string; answer?: string })
      .map((faq) => `Q: ${faq.question ?? 'Question'} A: ${faq.answer ?? 'Not provided'}`)
      .join(' | ')
    : 'None provided';

  return [
    'Context (dynamic, can be updated during testing):',
    `- Clinic Name: ${context.clinicName}`,
    `- Office Hours: ${officeHours}`,
    `- Services: ${formatServicesForPrompt(context.services)}`,
    `- Contact Info: ${formatContactInfo(context.clinic)}`,
    `- Clinic description: ${formatClinicDescriptionForPrompt(context.clinic)}`,
    `- Clinic photo/logo: ${formatClinicLogoForPrompt(context.clinic)}`,
    `- Bookable providers (staff): ${formatBookableStaffForPrompt(context.clinic)}`,
    `- Promotions / Updates: ${formatPromotionsForPrompt(context.policies)}`,
    `- Uploaded Clinic Context: ${uploadedContext}`,
    `- Greeting: ${voiceData.greetingMessage ?? voiceData.greeting ?? `Hi, welcome to ${context.clinicName}, what can I help you with today?`}`,
    `- Tone: ${voiceData.tone ?? 'professional'}`,
    `- Timezone: ${clinicData.timezone ?? 'America/New_York'}`,
    `- Booking Rules: default ${bookingData.defaultAppointmentDurationMinutes ?? 30} minutes; minimum notice ${bookingData.minNoticePeriodHours ?? 2} hours; maximum advance ${bookingData.maxAdvanceBookingDays ?? 30} days`,
    `- Closed Dates: ${Array.isArray(bookingData.closedDates) && bookingData.closedDates.length > 0 ? bookingData.closedDates.join(', ') : 'None configured'}`,
    `- FAQs: ${faqSummary}`,
  ];
}

function buildPromptHeader(environment: PromptEnvironment): string[] {
  if (environment === 'sidebar-test') {
    return [
      'You are a professional AI receptionist for a dental clinic.',
      'You are currently being tested in the clinic\'s client sidebar "AI Receptionist Test", where users talk to you live using their microphone to simulate a real call.',
      'Treat each interaction as if it were a real phone call simulation while the user watches the sidebar transcript and hears TTS playback.',
    ];
  }

  return [
    'You are a professional AI receptionist for a dental clinic handling a live patient phone call.',
    'Respond naturally, clearly, and politely, exactly like a real front-desk receptionist on the phone.',
  ];
}

function buildSharedReceptionistRules(): string[] {
  return [
    'Rules:',
    '1. Respond clearly and concisely, suitable for spoken conversation (2-3 short sentences).',
    '2. Maintain a friendly, professional, and patient-oriented tone.',
    '3. Base your answers on the provided context (clinic name, office hours, services, contact info, promotions).',
    '4. If you do not know the answer, politely suggest contacting the office.',
    '5. Avoid filler words like "um" or "uh", unless necessary for natural speech patterns.',
    '6. Include punctuation for TTS clarity and natural intonation.',
    '7. Never provide medical advice or diagnoses.',
    '8. If the caller has a dental emergency, direct them to emergency services or the nearest emergency room.',
    '9. If the caller says they want to die, are dead, might hurt themselves, are unsafe, or sound like a self-harm or mental-health crisis, stop normal receptionist flow and tell them to call 988 or 911 immediately and contact emergency services or a trusted nearby person right now.',
    '10. If the caller asks to speak to a human, direct them to the clinic\'s main contact line or staff callback process.',
    '11. Do not mention that you are an AI unless explicitly asked.',
    '12. Never invent appointment availability. Any real booking confirmation must come from backend calendar validation.',
    '13. When stating times, avoid saying "o\'clock". Use natural phrasing like "9 AM" or "9:00 AM".',
  ];
}

export function buildReceptionistSystemPrompt(
  context: TenantAIContext,
  environment: PromptEnvironment = 'phone',
): string {
  return [
    ...buildPromptHeader(environment),
    '',
    ...buildSharedReceptionistRules(),
    '',
    ...buildPromptContextBlock(context),
    '',
    environment === 'sidebar-test'
      ? 'Environment: This is the "AI Receptionist Test" sidebar in the client dashboard. Users may speak live to test your responses, see transcriptions, and hear your TTS output.'
      : 'Environment: This is a live production phone call. Keep the interaction calm, efficient, and easy to follow by voice only.',
    '',
    'Instructions for AI:',
    '- Prioritize speed, clarity, and natural flow for live conversation.',
    '- Respond immediately as if hearing the caller live.',
    '- Keep responses concise, but helpful and polite.',
    '- Use transcription-friendly formatting and short spoken phrasing.',
    '- Each response should feel like a realistic receptionist talking to a patient in real time.',
    '- If the caller asks something unknown, politely suggest contacting the office using the available contact information.',
  ].join('\n');
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
    voiceProfile: {
      ...(voice ?? {}),
      greetingMessage: normalizeGreetingMessage(clinic?.clinicName ?? 'our clinic', voice?.greetingMessage),
    },
    faqs,
  };

  await cache.setTenantScoped(tenantId, 'ai', cacheKey, JSON.stringify(context), 3600);

  return context;
}

export async function loadCurrentTenantAIContext(
  tenantId: string,
): Promise<TenantAIContext> {
  const [clinic] = await db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1);
  const tenantServices = await db.select().from(services).where(eq(services.tenantId, tenantId));
  const [booking] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);
  const tenantPolicies = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  const [voice] = await db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1);
  const faqs = await db.select().from(faqLibrary).where(eq(faqLibrary.tenantId, tenantId));

  return {
    tenantId,
    configVersion: 0,
    clinicName: clinic?.clinicName ?? 'Dental Clinic',
    clinic: clinic ?? {},
    services: tenantServices,
    bookingRules: booking ?? {},
    policies: tenantPolicies,
    voiceProfile: {
      ...(voice ?? {}),
      greetingMessage: normalizeGreetingMessage(clinic?.clinicName ?? 'our clinic', voice?.greetingMessage),
    },
    faqs,
  };
}

export async function loadLiveTenantAIContext(
  tenantId: string,
  configVersion?: number,
): Promise<TenantAIContext> {
  if (configVersion && configVersion > 0) {
    try {
      return await loadTenantAIContext(tenantId, configVersion);
    } catch (error) {
      if (!(error instanceof ConfigNotFoundError)) throw error;
    }
  }

  return loadCurrentTenantAIContext(tenantId);
}

export function buildSystemPrompt(context: TenantAIContext): string {
  return buildReceptionistSystemPrompt(context, 'phone');
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
  voiceId?: string;
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

  const lowConfidenceThreshold = 0.72;
  const systemPrompt =
    sttResult.confidence > 0 && sttResult.confidence < lowConfidenceThreshold
      ? [
          input.systemPrompt,
          '',
          'ASR note: The caller audio was low-confidence. Be extra careful with names, phone numbers, and times.',
          'If anything is unclear, ask them to repeat slowly and confirm by repeating it back. For numbers, ask for digits one by one.',
        ].join('\n')
      : input.systemPrompt;

  const llmResult = await processConversationTurn({
    tenantId: input.tenantId,
    callSessionId: input.callSessionId,
    systemPrompt,
    conversationHistory: input.conversationHistory,
    userMessage: sttResult.text,
  });

  const ttsResult = await executeTtsWithFailover({
    workloadType: 'tts',
    tenantId: input.tenantId,
    language: input.language,
    ttsRequest: {
      text: llmResult.response,
      voiceId: input.voiceId || input.voiceTone || 'default',
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
