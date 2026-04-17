import { db } from '../../db/index.js';
import {
  bookingRules,
  clinicProfile,
  faqLibrary,
  policies,
  services,
  tenantRegistry,
  voiceProfile,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateId } from '../../lib/crypto.js';
import { updateOnboardingStep } from './progress.js';

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
  const [existing] = await db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1);

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

  await db.update(tenantRegistry).set({ clinicName: data.clinicName, updatedAt: new Date() }).where(eq(tenantRegistry.id, tenantId));
  await updateOnboardingStep(tenantId, 'clinic-profile');
}

export async function saveStaffMembers(
  tenantId: string,
  staffMembers: Array<{ name: string; role: string }>
): Promise<void> {
  const [existing] = await db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1);
  if (existing) {
    await db
      .update(clinicProfile)
      .set({ staffMembers, updatedAt: new Date() })
      .where(eq(clinicProfile.id, existing.id));
  }
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
      category: svc.category as never,
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
    defaultAppointmentDurationMinutes?: number;
    bufferBetweenAppointmentsMinutes?: number;
    operatingSchedule?: Record<string, unknown>;
    closedDates?: string[];
    allowedChannels?: string[];
    doubleBookingPolicy?: string;
    emergencySlotPolicy?: string;
    rescheduleLimit?: number;
  },
): Promise<void> {
  const [existing] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);

  const values = {
    minNoticePeriodHours: data.minNoticeHours ?? 2,
    maxAdvanceBookingDays: data.advanceBookingDays ?? data.maxFutureDays ?? 30,
    cancellationCutoffHours: data.cancellationHours ?? 24,
    defaultAppointmentDurationMinutes: data.defaultAppointmentDurationMinutes ?? existing?.defaultAppointmentDurationMinutes ?? 30,
    bufferBetweenAppointmentsMinutes: data.bufferBetweenAppointmentsMinutes ?? existing?.bufferBetweenAppointmentsMinutes ?? 0,
    operatingSchedule: data.operatingSchedule ?? existing?.operatingSchedule ?? {},
    closedDates: data.closedDates ?? (existing as { closedDates?: string[] } | undefined)?.closedDates ?? [],
    doubleBookingPolicy: (data.doubleBookingPolicy ?? 'forbid') as never,
    emergencySlotPolicy: { policy: data.emergencySlotPolicy ?? 'reserved' },
    afterHoursPolicy: { action: 'voicemail' },
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(bookingRules).set(values).where(eq(bookingRules.id, existing.id));
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
  const [existing] = await db.select().from(policies).where(eq(policies.tenantId, tenantId)).limit(1);

  const escalationPolicy = policyList.find((policy) => policy.policyType === 'escalation');
  const emergencyPolicy = policyList.find((policy) => policy.policyType === 'emergency');
  const otherPolicies = policyList.filter((policy) => !['escalation', 'emergency'].includes(policy.policyType));

  const values = {
    escalationConditions: escalationPolicy
      ? { type: escalationPolicy.policyType, content: escalationPolicy.content }
      : (existing?.escalationConditions ?? { conditions: [] }),
    emergencyDisclaimer: emergencyPolicy?.content ?? existing?.emergencyDisclaimer ?? 'In case of emergency, please call 911.',
    sensitiveTopics: otherPolicies.map((policy) => ({
      type: policy.policyType,
      content: policy.content,
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

export async function saveContextDocuments(
  tenantId: string,
  documents: Array<{
    name: string;
    content: string;
    mimeType?: string;
  }>,
): Promise<void> {
  const sanitizeText = (value: string) => value.replace(/\u0000/g, '').trim();
  const [existing] = await db.select().from(policies).where(eq(policies.tenantId, tenantId)).limit(1);
  const existingSensitiveTopics = Array.isArray(existing?.sensitiveTopics)
    ? (existing.sensitiveTopics as Array<Record<string, unknown>>).filter((entry) => entry?.type !== 'context_document')
    : [];

  const documentTopics = documents.map((document) => ({
    type: 'context_document',
    title: document.name,
    mimeType: document.mimeType ?? 'text/plain',
    content: sanitizeText(document.content ?? ''),
  }));

  const values = {
    escalationConditions: existing?.escalationConditions ?? { conditions: [] },
    emergencyDisclaimer: existing?.emergencyDisclaimer ?? 'In case of emergency, please call 911.',
    sensitiveTopics: [...existingSensitiveTopics, ...documentTopics],
    complianceFlags: existing?.complianceFlags ?? {},
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

  await updateOnboardingStep(tenantId, 'review');
}

export async function saveVoiceProfile(
  tenantId: string,
  data: {
    tone?: string;
    language?: string;
    greeting?: string;
    voiceId?: string;
    agentId?: string;
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

  const [existing] = await db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1);
  const values = {
    tone: normalizedTone ?? 'professional',
    voiceId: data.voiceId ?? 'default',
    voiceAgentId: typeof data.agentId === 'string' ? data.agentId : undefined,
    speakingSpeed: String(data.speed ?? 1),
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
      category: (faq.category ?? 'general') as never,
    });
  }

  await updateOnboardingStep(tenantId, 'knowledge-base');
}
