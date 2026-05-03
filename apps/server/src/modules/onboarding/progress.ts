import { cache } from '../../lib/cache.js';
import { db } from '../../db/index.js';
import {
  bookingRules,
  clinicProfile,
  faqLibrary,
  integrations,
  policies,
  services,
  voiceProfile,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const STEP_ORDER = [
  'clinic-profile',
  'services',
  'booking-rules',
  'policies',
  'voice',
  'knowledge-base',
  'schedule',
] as const;

export function hasConfiguredOperatingSchedule(schedule?: Record<string, unknown> | null): boolean {
  if (!schedule || typeof schedule !== 'object') return false;

  return Object.values(schedule).some((value) => {
    if (!value || typeof value !== 'object') return false;
    const entry = value as { start?: unknown; end?: unknown };
    return typeof entry.start === 'string' && entry.start.trim() && typeof entry.end === 'string' && entry.end.trim();
  });
}

export async function detectCompletedSteps(tenantId: string): Promise<string[]> {
  const completed: string[] = [];

  const [clinic] = await db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1);
  if (clinic?.clinicName) completed.push('clinic-profile');

  const svcList = await db.select().from(services).where(eq(services.tenantId, tenantId));
  if (svcList.length > 0) completed.push('services');

  const [booking] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);
  if (booking) completed.push('booking-rules');
  if (hasConfiguredOperatingSchedule(booking?.operatingSchedule as Record<string, unknown> | null | undefined)) {
    completed.push('schedule');
  }

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

export function getNextStep(completedSteps: string[]): string {
  for (const step of STEP_ORDER) {
    if (!completedSteps.includes(step)) return step;
  }
  return 'complete';
}

export async function updateOnboardingStep(tenantId: string, _step: string): Promise<void> {
  await cache.invalidateTenantDomain(tenantId, 'ai');
  await cache.invalidateTenantDomain(tenantId, 'config');
  await cache.invalidateTenantDomain(tenantId, 'onboarding');
}
