import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  bookingRules,
  clinicProfile,
  faqLibrary,
  integrations,
  policies,
  services,
  tenantActiveConfig,
  tenantConfigVersions,
  voiceProfile,
} from '../../db/schema.js';
import { cache } from '../../lib/cache.js';
import { generateId } from '../../lib/crypto.js';
import { ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { detectCompletedSteps, getNextStep, hasConfiguredOperatingSchedule } from './progress.js';
import type { OnboardingStatus, ReadinessScorecard } from './types.js';

export async function computeReadinessScore(tenantId: string): Promise<ReadinessScorecard> {
  const scorecard: ReadinessScorecard = {
    clinicProfile: { score: 0, weight: 0.15, issues: [] },
    serviceCatalog: { score: 0, weight: 0.2, issues: [] },
    bookingRules: { score: 0, weight: 0.25, issues: [] },
    policyEscalation: { score: 0, weight: 0.25, issues: [] },
    toneProfile: { score: 0, weight: 0.05, issues: [] },
    integrations: { score: 0, weight: 0.1, issues: [] },
    totalScore: 0,
    isDeployable: false,
  };

  const [clinic] = await db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1);
  if (clinic) {
    let profileScore = 0;
    const requiredFields = ['clinicName', 'timezone'] as const;
    const optionalFields = ['legalEntityName', 'primaryPhone', 'supportEmail', 'locations'] as const;

    for (const field of requiredFields) {
      if (clinic[field]) profileScore += 30;
      else scorecard.clinicProfile.issues.push({ domain: 'clinic_profile', field, message: `${field} is required`, severity: 'error' });
    }
    for (const field of optionalFields) {
      if (clinic[field]) profileScore += 10;
      else scorecard.clinicProfile.issues.push({ domain: 'clinic_profile', field, message: `${field} is recommended`, severity: 'warning' });
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
    for (const service of tenantServices) {
      const isComplete = service.serviceName && service.category && service.durationMinutes;
      if (isComplete) completeCount += 1;
      else scorecard.serviceCatalog.issues.push({
        domain: 'services',
        field: service.serviceName,
        message: `Service "${service.serviceName}" is incomplete`,
        severity: 'warning',
      });
    }
    serviceScore += (completeCount / tenantServices.length) * 50;
    scorecard.serviceCatalog.score = Math.round(serviceScore);
  }

  const [booking] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);
  if (booking) {
    let bookingScore = 60;
    if (booking.maxAdvanceBookingDays) bookingScore += 20;
    if (booking.cancellationCutoffHours) bookingScore += 20;
    if (hasConfiguredOperatingSchedule(booking.operatingSchedule as Record<string, unknown> | null | undefined)) {
      bookingScore += 10;
    } else {
      scorecard.bookingRules.issues.push({
        domain: 'booking_rules',
        field: 'operatingSchedule',
        message: 'Clinic working hours and breaks are not configured',
        severity: 'warning',
      });
    }
    scorecard.bookingRules.score = Math.min(bookingScore, 100);
  } else {
    scorecard.bookingRules.issues.push({ domain: 'booking_rules', message: 'Booking rules not configured', severity: 'error' });
  }

  const tenantPolicies = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  if (tenantPolicies.length === 0) {
    scorecard.policyEscalation.issues.push({ domain: 'policies', message: 'No policies configured', severity: 'error' });
  } else {
    const policy = tenantPolicies[0];
    const hasEscalation = policy.escalationConditions && Object.keys(policy.escalationConditions as object).length > 0;
    const hasEmergency = Boolean(policy.emergencyDisclaimer);
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
    const activeCount = tenantIntegrations.filter((integration) => integration.status === 'active').length;
    scorecard.integrations.score = Math.round((activeCount / tenantIntegrations.length) * 100);
  }

  scorecard.totalScore = Math.round(
    scorecard.clinicProfile.score * scorecard.clinicProfile.weight
      + scorecard.serviceCatalog.score * scorecard.serviceCatalog.weight
      + scorecard.bookingRules.score * scorecard.bookingRules.weight
      + scorecard.policyEscalation.score * scorecard.policyEscalation.weight
      + scorecard.toneProfile.score * scorecard.toneProfile.weight
      + scorecard.integrations.score * scorecard.integrations.weight,
  );

  const allIssues = [
    ...scorecard.clinicProfile.issues,
    ...scorecard.serviceCatalog.issues,
    ...scorecard.bookingRules.issues,
    ...scorecard.policyEscalation.issues,
    ...scorecard.toneProfile.issues,
    ...scorecard.integrations.issues,
  ];
  const hasBlockingErrors = allIssues.some((issue) => issue.severity === 'error' && ['clinic_profile', 'policies'].includes(issue.domain));
  scorecard.isDeployable = scorecard.totalScore >= 70 && !hasBlockingErrors;

  return scorecard;
}

export async function getOnboardingStatus(tenantId: string): Promise<OnboardingStatus> {
  const cacheKey = 'onboarding-status';
  const cached = await cache.getTenantScoped(tenantId, 'onboarding', cacheKey);
  if (cached) return JSON.parse(cached) as OnboardingStatus;

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
    validationErrors: allIssues.filter((issue) => issue.severity === 'error'),
    validationWarnings: allIssues.filter((issue) => issue.severity === 'warning'),
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
  const serviceList = await db.select().from(services).where(eq(services.tenantId, tenantId));
  const [booking] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);
  const policyList = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  const [voice] = await db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1);
  const faqList = await db.select().from(faqLibrary).where(eq(faqLibrary.tenantId, tenantId));

  const snapshot = {
    clinicProfile: clinic,
    services: serviceList,
    bookingRules: booking,
    policies: policyList,
    voiceProfile: voice,
    faqs: faqList,
    publishedAt: new Date().toISOString(),
    readinessScore: scorecard.totalScore,
  };

  const existingVersions = await db.select().from(tenantConfigVersions).where(eq(tenantConfigVersions.tenantId, tenantId));
  const nextVersion = existingVersions.length + 1;
  const versionId = generateId();

  await db.transaction(async (tx) => {
    for (const version of existingVersions) {
      if (version.status === 'published') {
        await tx.update(tenantConfigVersions).set({ status: 'rolled_back' as never }).where(eq(tenantConfigVersions.id, version.id));
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

    const [existingActive] = await tx.select().from(tenantActiveConfig).where(eq(tenantActiveConfig.tenantId, tenantId)).limit(1);
    if (existingActive) {
      await tx.update(tenantActiveConfig).set({ activeVersion: nextVersion }).where(eq(tenantActiveConfig.tenantId, tenantId));
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
