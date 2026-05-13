import { and, eq } from 'drizzle-orm';
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
  tenantRegistry,
  twilioNumbers,
  voiceProfile,
} from '../../db/schema.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { cache } from '../../lib/cache.js';
import { generateId } from '../../lib/crypto.js';
import { ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { detectCompletedSteps, getNextStep, hasConfiguredOperatingSchedule } from './progress.js';
import type {
  OnboardingReadinessArea,
  OnboardingReadinessIssue,
  OnboardingReadinessResult,
  OnboardingStatus,
  ReadinessScorecard,
} from './types.js';

interface ReadinessOptions {
  requirePublishedConfig?: boolean;
}

function issue(
  severity: 'blocking' | 'warning',
  area: OnboardingReadinessArea,
  code: string,
  message: string,
): OnboardingReadinessIssue {
  return { code, severity, message, area };
}

function blocking(
  area: OnboardingReadinessArea,
  code: string,
  message: string,
): OnboardingReadinessIssue {
  return issue('blocking', area, code, message);
}

function warning(
  area: OnboardingReadinessArea,
  code: string,
  message: string,
): OnboardingReadinessIssue {
  return issue('warning', area, code, message);
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasBusinessHours(value: unknown): boolean {
  if (!isObject(value)) return false;
  return Object.keys(value).length > 0;
}

function hasEscalationPolicy(value: unknown): boolean {
  if (!isObject(value)) return false;
  return Object.keys(value).length > 0;
}

function hasHumanHandoffTarget(clinic: typeof clinicProfile.$inferSelect | undefined): boolean {
  if (!clinic) return false;
  if (hasText(clinic.primaryPhone) || hasText(clinic.phone)) return true;
  if (!Array.isArray(clinic.staffMembers)) return false;
  return clinic.staffMembers.some((member) => {
    if (!isObject(member)) return false;
    return hasText(member.phone);
  });
}

function hasCalendarCredentials(value: unknown): boolean {
  if (!isObject(value)) return false;
  return hasText(value.encryptedAccessToken) || hasText(value.encryptedRefreshToken);
}

export async function computeOnboardingReadiness(
  tenantId: string,
  options: ReadinessOptions = {},
): Promise<OnboardingReadinessResult> {
  assertTenantAccess(tenantId);
  const requirePublishedConfig = options.requirePublishedConfig ?? true;
  const blockingIssues: OnboardingReadinessIssue[] = [];
  const warnings: OnboardingReadinessIssue[] = [];

  const [tenant] = await db
    .select()
    .from(tenantRegistry)
    .where(eq(tenantRegistry.id, tenantId))
    .limit(1);

  if (!tenant) {
    blockingIssues.push(blocking('tenant', 'TENANT_NOT_FOUND', 'Active tenant was not found.'));
  } else if (tenant.status !== 'active') {
    blockingIssues.push(
      blocking('tenant', 'TENANT_NOT_ACTIVE', 'Tenant must be active before going live.'),
    );
  }

  if (requirePublishedConfig) {
    const [activeConfig] = await db
      .select()
      .from(tenantActiveConfig)
      .where(eq(tenantActiveConfig.tenantId, tenantId))
      .limit(1);

    if (!activeConfig || activeConfig.activeVersion <= 0) {
      blockingIssues.push(
        blocking(
          'config',
          'ACTIVE_PUBLISHED_CONFIG_MISSING',
          'No active published receptionist config is set.',
        ),
      );
    } else {
      const [publishedVersion] = await db
        .select()
        .from(tenantConfigVersions)
        .where(
          and(
            eq(tenantConfigVersions.tenantId, tenantId),
            eq(tenantConfigVersions.version, activeConfig.activeVersion),
            eq(tenantConfigVersions.status, 'published'),
          ),
        )
        .limit(1);

      if (!publishedVersion) {
        blockingIssues.push(
          blocking(
            'config',
            'ACTIVE_PUBLISHED_CONFIG_INVALID',
            'Active config version is not a valid published tenant config.',
          ),
        );
      }
    }
  }

  const [clinic] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.tenantId, tenantId))
    .limit(1);

  if (!clinic) {
    blockingIssues.push(
      blocking('clinic_profile', 'CLINIC_PROFILE_MISSING', 'Clinic profile is required.'),
    );
  } else {
    if (!hasText(clinic.clinicName)) {
      blockingIssues.push(
        blocking('clinic_profile', 'CLINIC_NAME_MISSING', 'Clinic name is required.'),
      );
    }
    if (!hasText(clinic.timezone)) {
      blockingIssues.push(
        blocking('clinic_profile', 'CLINIC_TIMEZONE_MISSING', 'Clinic timezone is required.'),
      );
    }
  }

  const tenantServices = await db.select().from(services).where(eq(services.tenantId, tenantId));
  const activeServices = tenantServices.filter((service) => service.isActive);
  if (activeServices.length === 0) {
    blockingIssues.push(
      blocking('services', 'ACTIVE_SERVICE_MISSING', 'At least one active service is required.'),
    );
  }
  for (const service of activeServices) {
    if (!service.durationMinutes || service.durationMinutes <= 0) {
      blockingIssues.push(
        blocking(
          'services',
          'SERVICE_DURATION_INVALID',
          'Active services must have a valid duration.',
        ),
      );
      break;
    }
  }

  const [booking] = await db
    .select()
    .from(bookingRules)
    .where(eq(bookingRules.tenantId, tenantId))
    .limit(1);

  if (!booking) {
    blockingIssues.push(
      blocking('booking', 'BOOKING_RULES_MISSING', 'Booking rules are required.'),
    );
  } else {
    if (
      booking.minNoticePeriodHours === null ||
      booking.minNoticePeriodHours === undefined ||
      booking.minNoticePeriodHours < 0
    ) {
      blockingIssues.push(
        blocking(
          'booking',
          'BOOKING_MIN_NOTICE_INVALID',
          'Booking minimum notice must be zero or greater.',
        ),
      );
    }
    if (!booking.maxAdvanceBookingDays || booking.maxAdvanceBookingDays <= 0) {
      blockingIssues.push(
        blocking(
          'booking',
          'BOOKING_MAX_ADVANCE_INVALID',
          'Booking max advance window must be greater than zero.',
        ),
      );
    }
    if ((booking.bufferBetweenAppointmentsMinutes ?? 0) < 0) {
      blockingIssues.push(
        blocking('booking', 'BOOKING_BUFFER_INVALID', 'Booking buffer must be zero or greater.'),
      );
    }
    if (
      !hasConfiguredOperatingSchedule(
        booking.operatingSchedule as Record<string, unknown> | null | undefined,
      ) &&
      !hasBusinessHours(clinic?.businessHours)
    ) {
      blockingIssues.push(
        blocking(
          'clinic_profile',
          'BUSINESS_HOURS_MISSING',
          'Business hours or booking operating schedule is required.',
        ),
      );
    }
  }

  const tenantPolicies = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  const policy = tenantPolicies[0];
  if (!policy) {
    blockingIssues.push(
      blocking('policy', 'POLICY_MISSING', 'Escalation and emergency policy is required.'),
    );
  } else {
    if (!hasEscalationPolicy(policy.escalationConditions)) {
      blockingIssues.push(
        blocking('policy', 'ESCALATION_POLICY_MISSING', 'Escalation policy is required.'),
      );
    }
    if (!hasText(policy.emergencyDisclaimer)) {
      blockingIssues.push(
        blocking(
          'policy',
          'EMERGENCY_POLICY_MISSING',
          'Emergency disclaimer or policy is required.',
        ),
      );
    }
    if (!hasHumanHandoffTarget(clinic)) {
      blockingIssues.push(
        blocking(
          'policy',
          'HUMAN_HANDOFF_TARGET_MISSING',
          'A human handoff phone number is required.',
        ),
      );
    }
  }

  const [voice] = await db
    .select()
    .from(voiceProfile)
    .where(eq(voiceProfile.tenantId, tenantId))
    .limit(1);
  if (!voice) {
    blockingIssues.push(blocking('voice', 'VOICE_PROFILE_MISSING', 'Voice profile is required.'));
  } else {
    if (!hasText(voice.greetingMessage)) {
      blockingIssues.push(
        blocking('voice', 'VOICE_GREETING_MISSING', 'Voice greeting is required.'),
      );
    }
    if (!hasText(voice.voiceId)) {
      blockingIssues.push(blocking('voice', 'VOICE_ID_MISSING', 'Voice id is required.'));
    }
    if (!hasText(voice.voiceAgentId)) {
      blockingIssues.push(
        blocking('voice', 'VOICE_AGENT_ID_MISSING', 'Voice agent id is required for live calls.'),
      );
    }
    if (!voice.tone) {
      warnings.push(warning('voice', 'VOICE_TONE_MISSING', 'Voice tone is not configured.'));
    }
  }

  const assignedNumbers = await db
    .select()
    .from(twilioNumbers)
    .where(and(eq(twilioNumbers.tenantId, tenantId), eq(twilioNumbers.status, 'active')));
  const activeVoiceNumber = assignedNumbers.find((number) => {
    const capabilities = number.capabilities;
    return isObject(capabilities) ? capabilities.voice !== false : true;
  });
  if (!activeVoiceNumber) {
    blockingIssues.push(
      blocking(
        'telephony',
        'ACTIVE_PHONE_NUMBER_MISSING',
        'An active voice-capable Twilio number is required.',
      ),
    );
  } else if (!hasText(activeVoiceNumber.twilioSid)) {
    blockingIssues.push(
      blocking(
        'telephony',
        'TWILIO_NUMBER_SID_MISSING',
        'Active Twilio number must include a Twilio SID.',
      ),
    );
  }

  const tenantIntegrations = await db
    .select()
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId));
  const googleCalendar = tenantIntegrations.find(
    (integration) =>
      integration.integrationType === 'calendar' &&
      integration.provider === 'google_calendar' &&
      integration.status === 'active',
  );
  if (!googleCalendar) {
    blockingIssues.push(
      blocking(
        'calendar',
        'GOOGLE_CALENDAR_INTEGRATION_MISSING',
        'An active Google Calendar integration is required for booking.',
      ),
    );
  } else {
    const config = googleCalendar.config;
    if (!isObject(config) || !hasText(config.calendarId)) {
      blockingIssues.push(
        blocking(
          'calendar',
          'GOOGLE_CALENDAR_ID_MISSING',
          'Google Calendar integration must have a selected calendar id.',
        ),
      );
    }
    if (!hasCalendarCredentials(googleCalendar.credentials)) {
      blockingIssues.push(
        blocking(
          'calendar',
          'GOOGLE_CALENDAR_OAUTH_MISSING',
          'Google Calendar OAuth token state is required.',
        ),
      );
    }
  }

  warnings.push(
    warning(
      'privacy',
      'PRIVACY_ACK_NOT_REPRESENTED',
      'No dedicated privacy/PHI acknowledgement field is represented in the current schema.',
    ),
  );

  return {
    ready: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

export async function assertTenantReadyForGoLive(
  tenantId: string,
  options: ReadinessOptions = {},
): Promise<OnboardingReadinessResult> {
  const readiness = await computeOnboardingReadiness(tenantId, {
    requirePublishedConfig: options.requirePublishedConfig ?? false,
  });
  if (!readiness.ready) {
    throw new ValidationError('Tenant is not ready to go live', readiness.blockingIssues);
  }
  return readiness;
}

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

  const [clinic] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.tenantId, tenantId))
    .limit(1);
  if (clinic) {
    let profileScore = 0;
    const requiredFields = ['clinicName', 'timezone'] as const;
    const optionalFields = [
      'legalEntityName',
      'primaryPhone',
      'supportEmail',
      'locations',
    ] as const;

    for (const field of requiredFields) {
      if (clinic[field]) profileScore += 30;
      else
        scorecard.clinicProfile.issues.push({
          domain: 'clinic_profile',
          field,
          message: `${field} is required`,
          severity: 'error',
        });
    }
    for (const field of optionalFields) {
      if (clinic[field]) profileScore += 10;
      else
        scorecard.clinicProfile.issues.push({
          domain: 'clinic_profile',
          field,
          message: `${field} is recommended`,
          severity: 'warning',
        });
    }
    scorecard.clinicProfile.score = Math.min(profileScore, 100);
  } else {
    scorecard.clinicProfile.issues.push({
      domain: 'clinic_profile',
      message: 'Clinic profile not created',
      severity: 'error',
    });
  }

  const tenantServices = await db.select().from(services).where(eq(services.tenantId, tenantId));
  if (tenantServices.length === 0) {
    scorecard.serviceCatalog.issues.push({
      domain: 'services',
      message: 'No services configured',
      severity: 'error',
    });
  } else {
    let serviceScore = 50;
    let completeCount = 0;
    for (const service of tenantServices) {
      const isComplete = service.serviceName && service.category && service.durationMinutes;
      if (isComplete) completeCount += 1;
      else
        scorecard.serviceCatalog.issues.push({
          domain: 'services',
          field: service.serviceName,
          message: `Service "${service.serviceName}" is incomplete`,
          severity: 'warning',
        });
    }
    serviceScore += (completeCount / tenantServices.length) * 50;
    scorecard.serviceCatalog.score = Math.round(serviceScore);
  }

  const [booking] = await db
    .select()
    .from(bookingRules)
    .where(eq(bookingRules.tenantId, tenantId))
    .limit(1);
  if (booking) {
    let bookingScore = 60;
    if (booking.maxAdvanceBookingDays) bookingScore += 20;
    if (booking.cancellationCutoffHours) bookingScore += 20;
    if (
      hasConfiguredOperatingSchedule(
        booking.operatingSchedule as Record<string, unknown> | null | undefined,
      )
    ) {
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
    scorecard.bookingRules.issues.push({
      domain: 'booking_rules',
      message: 'Booking rules not configured',
      severity: 'error',
    });
  }

  const tenantPolicies = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  if (tenantPolicies.length === 0) {
    scorecard.policyEscalation.issues.push({
      domain: 'policies',
      message: 'No policies configured',
      severity: 'error',
    });
  } else {
    const policy = tenantPolicies[0];
    const hasEscalation =
      policy.escalationConditions && Object.keys(policy.escalationConditions as object).length > 0;
    const hasEmergency = Boolean(policy.emergencyDisclaimer);
    let policyScore = 40;
    if (hasEscalation) policyScore += 30;
    else
      scorecard.policyEscalation.issues.push({
        domain: 'policies',
        message: 'Escalation policy missing',
        severity: 'error',
      });
    if (hasEmergency) policyScore += 30;
    else
      scorecard.policyEscalation.issues.push({
        domain: 'policies',
        message: 'Emergency policy missing',
        severity: 'warning',
      });
    scorecard.policyEscalation.score = Math.min(policyScore, 100);
  }

  const [voice] = await db
    .select()
    .from(voiceProfile)
    .where(eq(voiceProfile.tenantId, tenantId))
    .limit(1);
  if (voice) {
    let voiceScore = 50;
    if (voice.tone) voiceScore += 20;
    if (voice.voiceId) voiceScore += 15;
    if (voice.speakingSpeed) voiceScore += 15;
    scorecard.toneProfile.score = Math.min(voiceScore, 100);
  } else {
    scorecard.toneProfile.issues.push({
      domain: 'voice_profile',
      message: 'Voice profile not configured',
      severity: 'warning',
    });
  }

  const tenantIntegrations = await db
    .select()
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId));
  if (tenantIntegrations.length === 0) {
    scorecard.integrations.score = 0;
    scorecard.integrations.issues.push({
      domain: 'integrations',
      message: 'No integrations configured',
      severity: 'warning',
    });
  } else {
    const activeCount = tenantIntegrations.filter(
      (integration) => integration.status === 'active',
    ).length;
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
    (issue) => issue.severity === 'error' && ['clinic_profile', 'policies'].includes(issue.domain),
  );
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

  const [activeConfigRow] = await db
    .select()
    .from(tenantActiveConfig)
    .where(eq(tenantActiveConfig.tenantId, tenantId))
    .limit(1);
  const hasPublishedConfig =
    typeof activeConfigRow?.activeVersion === 'number' && activeConfigRow.activeVersion > 0;

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
    hasPublishedConfig,
  };

  await cache.setTenantScoped(tenantId, 'onboarding', cacheKey, JSON.stringify(status), 60);
  return status;
}

export async function publishOnboardingConfig(
  tenantId: string,
  actorUserId: string,
): Promise<{ configVersionId: string }> {
  await assertTenantReadyForGoLive(tenantId);
  const scorecard = await computeReadinessScore(tenantId);

  const [clinic] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.tenantId, tenantId))
    .limit(1);
  const serviceList = await db.select().from(services).where(eq(services.tenantId, tenantId));
  const [booking] = await db
    .select()
    .from(bookingRules)
    .where(eq(bookingRules.tenantId, tenantId))
    .limit(1);
  const policyList = await db.select().from(policies).where(eq(policies.tenantId, tenantId));
  const [voice] = await db
    .select()
    .from(voiceProfile)
    .where(eq(voiceProfile.tenantId, tenantId))
    .limit(1);
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

  const existingVersions = await db
    .select()
    .from(tenantConfigVersions)
    .where(eq(tenantConfigVersions.tenantId, tenantId));
  const nextVersion = existingVersions.length + 1;
  const versionId = generateId();

  await db.transaction(async (tx) => {
    for (const version of existingVersions) {
      if (version.status === 'published') {
        await tx
          .update(tenantConfigVersions)
          .set({ status: 'rolled_back' as never })
          .where(eq(tenantConfigVersions.id, version.id));
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
