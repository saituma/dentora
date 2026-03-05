
import { db } from '../../db/index.js';
import {
  tenantRegistry,
  clinicProfile,
  services,
  bookingRules,
  policies,
  voiceProfile,
  faqLibrary,
  integrations,
  tenantConfigVersions,
  tenantActiveConfig,
} from '../../db/schema.js';
import { eq, and, count } from 'drizzle-orm';
import { generateId } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { cache } from '../../lib/cache.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { env } from '../../config/env.js';

export interface OnboardingStatus {
  tenantId: string;
  currentStep: string;
  completedSteps: string[];
  readinessScore: number;
  validationErrors: ValidationIssue[];
  validationWarnings: ValidationIssue[];
  isReady: boolean;
}

export interface ValidationIssue {
  domain: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ReadinessScorecard {
  clinicProfile: { score: number; weight: number; issues: ValidationIssue[] };
  serviceCatalog: { score: number; weight: number; issues: ValidationIssue[] };
  bookingRules: { score: number; weight: number; issues: ValidationIssue[] };
  policyEscalation: { score: number; weight: number; issues: ValidationIssue[] };
  toneProfile: { score: number; weight: number; issues: ValidationIssue[] };
  integrations: { score: number; weight: number; issues: ValidationIssue[] };
  totalScore: number;
  isDeployable: boolean;
}

export async function saveClinicIdentity(
  tenantId: string,
  data: {
    clinicName: string;
    address?: string;
    phone?: string;
    email?: string;
    timezone?: string;
    operatingHours?: Record<string, unknown>;
    afterHoursBehavior?: string;
  },
): Promise<void> {
  const [existing] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.tenantId, tenantId))
    .limit(1);

  if (existing) {
    await db
      .update(clinicProfile)
      .set({
        clinicName: data.clinicName,
        primaryPhone: data.phone ?? existing.primaryPhone,
        supportEmail: data.email ?? existing.supportEmail,
        timezone: data.timezone ?? existing.timezone,
        locations: data.address ? [{ address: data.address, operatingHours: data.operatingHours }] : existing.locations,
        updatedAt: new Date(),
      })
      .where(eq(clinicProfile.id, existing.id));
  } else {
    await db.insert(clinicProfile).values({
      id: generateId(),
      tenantId,
      configVersion: 1,
      clinicName: data.clinicName,
      legalEntityName: data.clinicName,
      primaryPhone: data.phone ?? '',
      supportEmail: data.email ?? '',
      timezone: data.timezone ?? 'America/New_York',
      locations: data.address ? [{ address: data.address, operatingHours: data.operatingHours }] : [],
    });
  }

  await db
    .update(tenantRegistry)
    .set({ clinicName: data.clinicName, updatedAt: new Date() })
    .where(eq(tenantRegistry.id, tenantId));

  await updateOnboardingStep(tenantId, 'clinic-profile');
}

export async function saveServices(
  tenantId: string,
  serviceList: Array<{
    id?: string;
    serviceName: string;
    category: string;
    description?: string;
    durationMinutes: number;
    price?: string;
    isActive?: boolean;
  }>,
): Promise<void> {
  await db.delete(services).where(eq(services.tenantId, tenantId));

  for (const svc of serviceList) {
    await db.insert(services).values({
      id: svc.id ?? generateId(),
      tenantId,
      configVersion: 1,
      serviceCode: generateId(),
      serviceName: svc.serviceName,
      category: svc.category as any,
      durationMinutes: svc.durationMinutes,
      isActive: svc.isActive ?? true,
    });
  }

  await updateOnboardingStep(tenantId, 'services');
}

export async function saveBookingRules(
  tenantId: string,
  data: {
    advanceBookingDays?: number;
    cancellationHours?: number;
    minNoticeHours?: number;
    maxFutureDays?: number;
    allowedChannels?: string[];
    doubleBookingPolicy?: string;
    emergencySlotPolicy?: string;
    rescheduleLimit?: number;
  },
): Promise<void> {
  const [existing] = await db
    .select()
    .from(bookingRules)
    .where(eq(bookingRules.tenantId, tenantId))
    .limit(1);

  const values = {
    minNoticePeriodHours: data.minNoticeHours ?? 2,
    maxAdvanceBookingDays: data.advanceBookingDays ?? data.maxFutureDays ?? 30,
    cancellationCutoffHours: data.cancellationHours ?? 24,
    doubleBookingPolicy: (data.doubleBookingPolicy ?? 'forbid') as any,
    emergencySlotPolicy: { policy: data.emergencySlotPolicy ?? 'reserved' },
    afterHoursPolicy: { action: 'voicemail' },
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(bookingRules)
      .set(values)
      .where(eq(bookingRules.id, existing.id));
  } else {
    await db.insert(bookingRules).values({
      id: generateId(),
      tenantId,
      configVersion: 1,
      ...values,
    });
  }

  await updateOnboardingStep(tenantId, 'booking-rules');
}

export async function savePolicies(
  tenantId: string,
  policyList: Array<{
    id?: string;
    policyType: string;
    content: string;
  }>,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
    .limit(1);

  const escalationPolicy = policyList.find((p) => p.policyType === 'escalation');
  const emergencyPolicy = policyList.find((p) => p.policyType === 'emergency');
  const otherPolicies = policyList.filter(
    (p) => !['escalation', 'emergency'].includes(p.policyType),
  );

  const values = {
    escalationConditions: escalationPolicy
      ? { type: escalationPolicy.policyType, content: escalationPolicy.content }
      : (existing?.escalationConditions ?? { conditions: [] }),
    emergencyDisclaimer:
      emergencyPolicy?.content ??
      existing?.emergencyDisclaimer ??
      'In case of emergency, please call 911.',
    sensitiveTopics: otherPolicies.map((p) => ({
      type: p.policyType,
      content: p.content,
    })),
    complianceFlags: {},
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(policies).set(values).where(eq(policies.id, existing.id));
  } else {
    await db.insert(policies).values({
      id: generateId(),
      tenantId,
      configVersion: 1,
      humanCallbackSlaMinutes: 30,
      ...values,
    });
  }

  await updateOnboardingStep(tenantId, 'policies');
}

export async function saveVoiceProfile(
  tenantId: string,
  data: {
    tone?: string;
    language?: string;
    greeting?: string;
    voiceId?: string;
    speed?: number;
    verbosityLevel?: string;
    empathyLevel?: string;
    greetingStyle?: string;
    prohibitedPhrases?: string[];
    requiredPhrases?: string[];
  },
): Promise<void> {
  const normalizedTone =
    data.tone === 'warm'
      ? 'friendly'
      : (data.tone as 'calm' | 'friendly' | 'professional' | 'urgent' | 'formal' | 'casual' | undefined);

  const [existing] = await db
    .select()
    .from(voiceProfile)
    .where(eq(voiceProfile.tenantId, tenantId))
    .limit(1);

  const values = {
    tone: normalizedTone ?? 'professional',
    voiceId: data.voiceId ?? 'default',
    speakingSpeed: String(data.speed ?? 1.0),
    greetingMessage: data.greeting ?? null,
    language: data.language ?? 'en',
    pronunciationHints: {},
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(voiceProfile).set(values).where(eq(voiceProfile.id, existing.id));
  } else {
    await db.insert(voiceProfile).values({
      id: generateId(),
      tenantId,
      configVersion: 1,
      ...values,
    });
  }

  await updateOnboardingStep(tenantId, 'voice');
}

export async function saveFaqs(
  tenantId: string,
  faqList: Array<{
    id?: string;
    question: string;
    answer: string;
    category?: string;
  }>,
): Promise<void> {
  await db.delete(faqLibrary).where(eq(faqLibrary.tenantId, tenantId));

  for (const faq of faqList) {
    await db.insert(faqLibrary).values({
      id: faq.id ?? generateId(),
      tenantId,
      configVersion: 1,
      question: faq.question,
      answer: faq.answer,
      faqKey: faq.id ?? generateId(),
      questionVariants: [faq.question],
      canonicalAnswer: faq.answer,
      category: (faq.category ?? 'general') as any,
    });
  }

  await updateOnboardingStep(tenantId, 'knowledge-base');
}

export async function computeReadinessScore(tenantId: string): Promise<ReadinessScorecard> {
  const scorecard: ReadinessScorecard = {
    clinicProfile: { score: 0, weight: 0.15, issues: [] },
    serviceCatalog: { score: 0, weight: 0.20, issues: [] },
    bookingRules: { score: 0, weight: 0.25, issues: [] },
    policyEscalation: { score: 0, weight: 0.25, issues: [] },
    toneProfile: { score: 0, weight: 0.05, issues: [] },
    integrations: { score: 0, weight: 0.10, issues: [] },
    totalScore: 0,
    isDeployable: false,
  };

  const [clinic] = await db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1);
  if (clinic) {
    let profileScore = 0;
    const requiredFields = ['clinicName', 'timezone'] as const;
    const optionalFields = ['legalEntityName', 'primaryPhone', 'supportEmail', 'locations'] as const;

    for (const f of requiredFields) {
      if (clinic[f]) profileScore += 30;
      else scorecard.clinicProfile.issues.push({ domain: 'clinic_profile', field: f, message: `${f} is required`, severity: 'error' });
    }
    for (const f of optionalFields) {
      if (clinic[f]) profileScore += 10;
      else scorecard.clinicProfile.issues.push({ domain: 'clinic_profile', field: f, message: `${f} is recommended`, severity: 'warning' });
    }
    scorecard.clinicProfile.score = Math.min(profileScore, 100);
  } else {
    scorecard.clinicProfile.issues.push({ domain: 'clinic_profile', message: 'Clinic profile not created', severity: 'error' });
  }

  const tenantServices = await db.select().from(services).where(eq(services.tenantId, tenantId));
  if (tenantServices.length === 0) {
    scorecard.serviceCatalog.issues.push({ domain: 'services', message: 'No services configured', severity: 'error' });
  } else {
    let serviceScore = 50;
    let completeCount = 0;
    for (const svc of tenantServices) {
      const isComplete = svc.serviceName && svc.category && svc.durationMinutes;
      if (isComplete) completeCount++;
      else scorecard.serviceCatalog.issues.push({ domain: 'services', field: svc.serviceName, message: `Service "${svc.serviceName}" is incomplete`, severity: 'warning' });
    }
    serviceScore += (completeCount / tenantServices.length) * 50;
    scorecard.serviceCatalog.score = Math.round(serviceScore);
  }

  const [booking] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);
  if (booking) {
    let bookingScore = 60;
    if (booking.maxAdvanceBookingDays) bookingScore += 20;
    if (booking.cancellationCutoffHours) bookingScore += 20;
    scorecard.bookingRules.score = Math.min(bookingScore, 100);
  } else {
    scorecard.bookingRules.issues.push({ domain: 'booking_rules', message: 'Booking rules not configured', severity: 'error' });
  }

  const tenantPolicies = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  if (tenantPolicies.length === 0) {
    scorecard.policyEscalation.issues.push({ domain: 'policies', message: 'No policies configured', severity: 'error' });
  } else {
    const policy = tenantPolicies[0];
    const hasEscalation = policy.escalationConditions && Object.keys(policy.escalationConditions as any).length > 0;
    const hasEmergency = !!policy.emergencyDisclaimer;
    let policyScore = 40;
    if (hasEscalation) policyScore += 30;
    else scorecard.policyEscalation.issues.push({ domain: 'policies', message: 'Escalation policy missing', severity: 'error' });
    if (hasEmergency) policyScore += 30;
    else scorecard.policyEscalation.issues.push({ domain: 'policies', message: 'Emergency policy missing', severity: 'warning' });
    scorecard.policyEscalation.score = Math.min(policyScore, 100);
  }

  const [voice] = await db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1);
  if (voice) {
    let voiceScore = 50;
    if (voice.tone) voiceScore += 20;
    if (voice.voiceId) voiceScore += 15;
    if (voice.speakingSpeed) voiceScore += 15;
    scorecard.toneProfile.score = Math.min(voiceScore, 100);
  } else {
    scorecard.toneProfile.issues.push({ domain: 'voice_profile', message: 'Voice profile not configured', severity: 'warning' });
  }

  const tenantIntegrations = await db.select().from(integrations).where(eq(integrations.tenantId, tenantId));
  if (tenantIntegrations.length === 0) {
    scorecard.integrations.score = 0;
    scorecard.integrations.issues.push({ domain: 'integrations', message: 'No integrations configured', severity: 'warning' });
  } else {
    const activeCount = tenantIntegrations.filter((i) => i.status === 'active').length;
    scorecard.integrations.score = Math.round((activeCount / tenantIntegrations.length) * 100);
  }

  scorecard.totalScore = Math.round(
    scorecard.clinicProfile.score * scorecard.clinicProfile.weight +
    scorecard.serviceCatalog.score * scorecard.serviceCatalog.weight +
    scorecard.bookingRules.score * scorecard.bookingRules.weight +
    scorecard.policyEscalation.score * scorecard.policyEscalation.weight +
    scorecard.toneProfile.score * scorecard.toneProfile.weight +
    scorecard.integrations.score * scorecard.integrations.weight,
  );

  const allIssues = [
    ...scorecard.clinicProfile.issues,
    ...scorecard.serviceCatalog.issues,
    ...scorecard.bookingRules.issues,
    ...scorecard.policyEscalation.issues,
    ...scorecard.toneProfile.issues,
    ...scorecard.integrations.issues,
  ];
  const hasBlockingErrors = allIssues.some(
    (i) => i.severity === 'error' && ['clinic_profile', 'policies'].includes(i.domain),
  );
  scorecard.isDeployable = scorecard.totalScore >= 70 && !hasBlockingErrors;

  return scorecard;
}

export async function getOnboardingStatus(tenantId: string): Promise<OnboardingStatus> {
  const cacheKey = `onboarding-status`;
  const cached = await cache.getTenantScoped(tenantId, 'onboarding', cacheKey);
  if (cached) return JSON.parse(cached);

  const scorecard = await computeReadinessScore(tenantId);
  const completedSteps = await detectCompletedSteps(tenantId);
  const currentStep = getNextStep(completedSteps);

  const allIssues = [
    ...scorecard.clinicProfile.issues,
    ...scorecard.serviceCatalog.issues,
    ...scorecard.bookingRules.issues,
    ...scorecard.policyEscalation.issues,
    ...scorecard.toneProfile.issues,
    ...scorecard.integrations.issues,
  ];

  const status: OnboardingStatus = {
    tenantId,
    currentStep,
    completedSteps,
    readinessScore: scorecard.totalScore,
    validationErrors: allIssues.filter((i) => i.severity === 'error'),
    validationWarnings: allIssues.filter((i) => i.severity === 'warning'),
    isReady: scorecard.isDeployable,
  };

  await cache.setTenantScoped(tenantId, 'onboarding', cacheKey, JSON.stringify(status), 60);

  return status;
}

export async function publishOnboardingConfig(
  tenantId: string,
  actorUserId: string,
): Promise<{ configVersionId: string }> {
  const scorecard = await computeReadinessScore(tenantId);

  if (!scorecard.isDeployable) {
    throw new ValidationError('Configuration is not ready for deployment');
  }

  const [clinic] = await db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1);
  const svcList = await db.select().from(services).where(eq(services.tenantId, tenantId));
  const [booking] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);
  const policyList = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  const [voice] = await db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1);
  const faqList = await db.select().from(faqLibrary).where(eq(faqLibrary.tenantId, tenantId));

  const snapshot = {
    clinicProfile: clinic,
    services: svcList,
    bookingRules: booking,
    policies: policyList,
    voiceProfile: voice,
    faqs: faqList,
    publishedAt: new Date().toISOString(),
    readinessScore: scorecard.totalScore,
  };

  const existingVersions = await db
    .select()
    .from(tenantConfigVersions)
    .where(eq(tenantConfigVersions.tenantId, tenantId));

  const nextVersion = existingVersions.length + 1;
  const versionId = generateId();

  await db.transaction(async (tx) => {
    for (const v of existingVersions) {
      if (v.status === 'published') {
        await tx
          .update(tenantConfigVersions)
          .set({ status: 'rolled_back' as any })
          .where(eq(tenantConfigVersions.id, v.id));
      }
    }

    await tx.insert(tenantConfigVersions).values({
      id: versionId,
      tenantId,
      version: nextVersion,
      snapshot,
      status: 'published',
      createdBy: actorUserId,
    });

    const [existingActive] = await tx
      .select()
      .from(tenantActiveConfig)
      .where(eq(tenantActiveConfig.tenantId, tenantId))
      .limit(1);

    if (existingActive) {
      await tx
        .update(tenantActiveConfig)
        .set({ activeVersion: nextVersion })
        .where(eq(tenantActiveConfig.tenantId, tenantId));
    } else {
      await tx.insert(tenantActiveConfig).values({
        tenantId,
        activeVersion: nextVersion,
        activatedBy: actorUserId,
      });
    }
  });

  await cache.invalidateTenantDomain(tenantId, 'ai');
  await cache.invalidateTenantDomain(tenantId, 'onboarding');

  logger.info({ tenantId, versionId, version: nextVersion }, 'Onboarding config published');

  return { configVersionId: versionId };
}

export async function generateVoicePreview(
  tenantId: string,
  data: { voiceId: string; text: string; speed?: number },
): Promise<Buffer> {
  const { getTtsAdapter } = await import('../ai/providers/index.js');

  const ttsProvider = getTtsAdapter(env.TTS_PROVIDER);
  const result = await ttsProvider.synthesize({
    text: data.text,
    voiceId: data.voiceId,
    speed: data.speed ?? 1.0,
    language: 'en-US',
    tenantId,
  });

  logger.info(
    { tenantId, voiceId: data.voiceId, provider: ttsProvider.name, latencyMs: result.latencyMs },
    'Voice preview generated',
  );

  return result.audio;
}

export async function transcribeLiveAudio(
  tenantId: string,
  data: { audioBase64: string; mimeType?: string; language?: string },
): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new ValidationError('OpenAI API key is required for live transcription');
  }

  const rawMimeType = (data.mimeType || 'audio/webm').toLowerCase();
  const mimeType = rawMimeType.split(';')[0] || 'audio/webm';
  const language = data.language || 'en';

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(data.audioBase64, 'base64');
  } catch {
    throw new ValidationError('Invalid audio payload');
  }

  if (!audioBuffer.length) {
    throw new ValidationError('Empty audio payload');
  }

  if (audioBuffer.length < 1024) {
    return '';
  }

  const extension = mimeType.includes('wav')
    ? 'wav'
    : mimeType.includes('mp4') || mimeType.includes('m4a')
      ? 'mp4'
      : mimeType.includes('mpeg') || mimeType.includes('mp3')
        ? 'mp3'
        : mimeType.includes('ogg')
          ? 'ogg'
          : 'webm';

  const form = new FormData();
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', language);
  form.append('response_format', 'json');
  const audioBytes = Uint8Array.from(audioBuffer);
  form.append(
    'file',
    new Blob([audioBytes], { type: mimeType }),
    `live-input.${extension}`,
  );

  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      ...(process.env.OPENAI_ORG_ID ? { 'OpenAI-Organization': process.env.OPENAI_ORG_ID } : {}),
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const isRecoverableChunkError = response.status === 400
      && errorBody.includes('Audio file might be corrupted or unsupported')
      && errorBody.includes('"param": "file"');

    if (isRecoverableChunkError) {
      logger.debug(
        {
          tenantId,
          mimeType,
          bytes: audioBuffer.length,
          status: response.status,
        },
        'Live audio chunk rejected by provider; returning empty transcript chunk',
      );
      return '';
    }

    let providerMessage = 'Live transcription request was rejected by provider';
    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string } };
      if (parsed.error?.message) {
        providerMessage = parsed.error.message;
      }
    } catch {
      if (errorBody.trim()) {
        providerMessage = errorBody.trim();
      }
    }

    throw new ValidationError(`Live transcription failed (${response.status}): ${providerMessage}`);
  }

  const result = (await response.json()) as { text?: string };
  const transcript = (result.text || '').trim();

  logger.info(
    {
      tenantId,
      mimeType,
      language,
      bytes: audioBuffer.length,
      latencyMs: Date.now() - startedAt,
      transcriptChars: transcript.length,
    },
    'Live audio transcribed',
  );

  return transcript;
}

const STEP_ORDER = [
  'clinic-profile',
  'services',
  'booking-rules',
  'policies',
  'voice',
  'knowledge-base',
  'integrations',
  'review',
] as const;

async function detectCompletedSteps(tenantId: string): Promise<string[]> {
  const completed: string[] = [];

  const [clinic] = await db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1);
  if (clinic?.clinicName) completed.push('clinic-profile');

  const svcList = await db.select().from(services).where(eq(services.tenantId, tenantId));
  if (svcList.length > 0) completed.push('services');

  const [booking] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);
  if (booking) completed.push('booking-rules');

  const policyList = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  if (policyList.length > 0) completed.push('policies');

  const [voice] = await db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1);
  if (voice) completed.push('voice');

  const faqList = await db.select().from(faqLibrary).where(eq(faqLibrary.tenantId, tenantId));
  if (faqList.length > 0) completed.push('knowledge-base');

  const intList = await db.select().from(integrations).where(eq(integrations.tenantId, tenantId));
  if (intList.length > 0) completed.push('integrations');

  return completed;
}

function getNextStep(completedSteps: string[]): string {
  for (const step of STEP_ORDER) {
    if (!completedSteps.includes(step)) return step;
  }
  return 'review';
}

async function updateOnboardingStep(tenantId: string, _step: string): Promise<void> {
  await cache.invalidateTenantDomain(tenantId, 'onboarding');
}
