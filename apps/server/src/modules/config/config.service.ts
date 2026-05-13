import { db } from '../../db/index.js';
import {
  tenantConfigVersions,
  tenantActiveConfig,
  clinicProfile,
  services,
  bookingRules,
  policies,
  voiceProfile,
  faqLibrary,
} from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { generateId } from '../../lib/crypto.js';
import {
  cache,
  tenantCacheGet,
  tenantCacheSet,
  tenantCacheInvalidateDomain,
} from '../../lib/cache.js';

const CONFIG_CACHE_TTL = 300; // 5 minutes
import { logger } from '../../lib/logger.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import { listAvailableVoices } from '../onboarding/onboarding.service.js';
import { assertTenantReadyForGoLive } from '../onboarding/readiness.js';
import { assertTenantAccess } from '../../db/tenant-context.js';

type ClinicProfileSelect = typeof clinicProfile.$inferSelect;
type ClinicProfileInsert = typeof clinicProfile.$inferInsert;
type ServicesInsert = typeof services.$inferInsert;
type BookingRulesInsert = typeof bookingRules.$inferInsert;
type PoliciesInsert = typeof policies.$inferInsert;
type VoiceProfileInsert = typeof voiceProfile.$inferInsert;
type FaqLibraryInsert = typeof faqLibrary.$inferInsert;

function normalizeClinicProfile(profile: ClinicProfileSelect | undefined) {
  if (!profile) return null;

  const firstLocationAddress = Array.isArray(profile.locations)
    ? profile.locations.find((location: unknown) => {
        if (!location || typeof location !== 'object') return false;
        const maybeAddress = (location as { address?: unknown }).address;
        return typeof maybeAddress === 'string' && maybeAddress.trim().length > 0;
      })
    : null;

  const locationAddress =
    firstLocationAddress && typeof firstLocationAddress === 'object'
      ? (firstLocationAddress as { address?: string }).address
      : undefined;

  return {
    ...profile,
    address:
      typeof profile.address === 'string' && profile.address.trim().length > 0
        ? profile.address
        : (locationAddress ?? null),
    phone:
      typeof profile.phone === 'string' && profile.phone.trim().length > 0
        ? profile.phone
        : (profile.primaryPhone ?? null),
    email:
      typeof profile.email === 'string' && profile.email.trim().length > 0
        ? profile.email
        : (profile.supportEmail ?? null),
  };
}

function normalizeVoiceProfile(profile: Record<string, unknown> | undefined | null) {
  if (!profile) return null;

  const speechSpeedValue =
    typeof profile.speechSpeed === 'number'
      ? profile.speechSpeed
      : typeof profile.speakingSpeed === 'number'
        ? profile.speakingSpeed
        : typeof profile.speakingSpeed === 'string'
          ? Number(profile.speakingSpeed)
          : undefined;

  return {
    ...profile,
    speechSpeed:
      typeof speechSpeedValue === 'number' && Number.isFinite(speechSpeedValue)
        ? speechSpeedValue
        : undefined,
  };
}

function normalizeStoredGreetingMessage(
  clinicName: string,
  greetingMessage?: string | null,
): string | null {
  const normalized = String(greetingMessage ?? '').trim();
  const replacement = `Hi, welcome to ${clinicName}, what can I help you with today?`;

  if (!normalized) return replacement;

  const comparable = normalized.toLowerCase().replace(/\s+/g, ' ');
  if (
    comparable === 'hi, thank you for calling. how can i help you today?' ||
    comparable === 'hello, thank you for calling. how can i help you today?' ||
    comparable === 'hello, thank you for calling. how may i help you today?'
  ) {
    return replacement;
  }

  return normalized;
}

async function replacePaidVoiceWithFreeLiveVoice(profile: Record<string, unknown> | undefined) {
  if (!profile || typeof profile.voiceId !== 'string' || !profile.voiceId.trim()) {
    return profile;
  }

  try {
    const voices = await listAvailableVoices();
    const configuredVoice = voices.find((voice) => voice.voiceId === profile.voiceId) ?? null;

    if (!configuredVoice || configuredVoice.liveSupported !== false) {
      return profile;
    }

    const fallbackVoice = voices.find((voice) => voice.liveSupported !== false) ?? null;
    if (!fallbackVoice) {
      return {
        ...profile,
        voiceId: 'professional',
      };
    }

    return {
      ...profile,
      voiceId: fallbackVoice.voiceId,
      fallbackVoiceId: fallbackVoice.voiceId,
    };
  } catch (error) {
    logger.warn(
      { err: error, tenantId: profile.tenantId },
      'Failed to replace paid-only voice with free live voice',
    );
    return profile;
  }
}

function mapVoiceProfileInput(data: Record<string, unknown>) {
  const speechSpeed =
    typeof data.speechSpeed === 'number'
      ? data.speechSpeed
      : typeof data.speakingSpeed === 'number'
        ? data.speakingSpeed
        : typeof data.speakingSpeed === 'string'
          ? Number(data.speakingSpeed)
          : undefined;

  const mappedData: Record<string, unknown> = {
    ...data,
  };

  delete mappedData.speechSpeed;

  if (typeof speechSpeed === 'number' && Number.isFinite(speechSpeed)) {
    mappedData.speakingSpeed = String(speechSpeed);
  }

  return mappedData;
}

export async function upsertClinicProfile(tenantId: string, data: Record<string, unknown>) {
  assertTenantAccess(tenantId);
  const address = typeof data.address === 'string' ? data.address.trim() : '';
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim() : '';

  const mappedData: Record<string, unknown> = {
    ...data,
    primaryPhone: phone || data.primaryPhone,
    supportEmail: email || data.supportEmail,
  };

  if (address.length > 0) {
    mappedData.locations = [{ address }];
  }

  const [existing] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.tenantId, tenantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(clinicProfile)
      .set({ ...mappedData, updatedAt: new Date() } as Partial<ClinicProfileInsert>)
      .where(eq(clinicProfile.tenantId, tenantId))
      .returning();
    await Promise.all([
      cache.invalidateTenantDomain(tenantId, 'ai'),
      tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined),
    ]);
    return normalizeClinicProfile(updated);
  }

  const [created] = await db
    .insert(clinicProfile)
    .values({ id: generateId(), tenantId, ...mappedData } as ClinicProfileInsert)
    .returning();
  await Promise.all([
    cache.invalidateTenantDomain(tenantId, 'ai'),
    tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined),
  ]);
  return normalizeClinicProfile(created);
}

export async function getClinicProfile(tenantId: string) {
  assertTenantAccess(tenantId);
  const cached = await tenantCacheGet<ReturnType<typeof normalizeClinicProfile>>(
    tenantId,
    'config',
    'clinic',
  );
  if (cached) return cached;
  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.tenantId, tenantId))
    .limit(1);
  const result = normalizeClinicProfile(profile);
  await tenantCacheSet(tenantId, 'config', 'clinic', result, CONFIG_CACHE_TTL).catch(
    () => undefined,
  );
  return result;
}

export async function addService(tenantId: string, data: Record<string, unknown>) {
  assertTenantAccess(tenantId);
  const [svc] = await db
    .insert(services)
    .values({ id: generateId(), tenantId, ...data } as ServicesInsert)
    .returning();
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
  return svc;
}

export async function updateService(
  tenantId: string,
  serviceId: string,
  data: Record<string, unknown>,
) {
  assertTenantAccess(tenantId);
  const [updated] = await db
    .update(services)
    .set({ ...data, updatedAt: new Date() } as Partial<ServicesInsert>)
    .where(and(eq(services.id, serviceId), eq(services.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('Service not found');
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
  return updated;
}

export async function deleteService(tenantId: string, serviceId: string) {
  assertTenantAccess(tenantId);
  await db.delete(services).where(and(eq(services.id, serviceId), eq(services.tenantId, tenantId)));
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
}

export async function getServices(tenantId: string): Promise<(typeof services.$inferSelect)[]> {
  assertTenantAccess(tenantId);
  const cached = await tenantCacheGet<(typeof services.$inferSelect)[]>(
    tenantId,
    'config',
    'services',
  );
  if (cached) return cached;
  const rows = await db.select().from(services).where(eq(services.tenantId, tenantId)).limit(500);
  await tenantCacheSet(tenantId, 'config', 'services', rows, CONFIG_CACHE_TTL).catch(
    () => undefined,
  );
  return rows;
}

export async function upsertBookingRules(tenantId: string, data: Record<string, unknown>) {
  assertTenantAccess(tenantId);
  const [existing] = await db
    .select()
    .from(bookingRules)
    .where(eq(bookingRules.tenantId, tenantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(bookingRules)
      .set({ ...data, updatedAt: new Date() } as Partial<BookingRulesInsert>)
      .where(eq(bookingRules.tenantId, tenantId))
      .returning();
    await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
    return updated;
  }

  const [created] = await db
    .insert(bookingRules)
    .values({ id: generateId(), tenantId, ...data } as BookingRulesInsert)
    .returning();
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
  return created;
}

export async function getBookingRules(tenantId: string) {
  assertTenantAccess(tenantId);
  const cached = await tenantCacheGet<typeof bookingRules.$inferSelect | null>(
    tenantId,
    'config',
    'booking-rules',
  );
  if (cached !== null && cached !== undefined) return cached;
  const [rules] = await db
    .select()
    .from(bookingRules)
    .where(eq(bookingRules.tenantId, tenantId))
    .limit(1);
  const result = rules ?? null;
  await tenantCacheSet(tenantId, 'config', 'booking-rules', result, CONFIG_CACHE_TTL).catch(
    () => undefined,
  );
  return result;
}

export async function addPolicy(tenantId: string, data: Record<string, unknown>) {
  assertTenantAccess(tenantId);
  const [policy] = await db
    .insert(policies)
    .values({ id: generateId(), tenantId, ...data } as PoliciesInsert)
    .returning();
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
  return policy;
}

export async function updatePolicy(
  tenantId: string,
  policyId: string,
  data: Record<string, unknown>,
) {
  assertTenantAccess(tenantId);
  const [updated] = await db
    .update(policies)
    .set({ ...data, updatedAt: new Date() } as Partial<PoliciesInsert>)
    .where(and(eq(policies.id, policyId), eq(policies.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('Policy not found');
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
  return updated;
}

export async function deletePolicy(tenantId: string, policyId: string) {
  assertTenantAccess(tenantId);
  await db.delete(policies).where(and(eq(policies.id, policyId), eq(policies.tenantId, tenantId)));
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
}

export async function getPolicies(tenantId: string): Promise<(typeof policies.$inferSelect)[]> {
  assertTenantAccess(tenantId);
  const cached = await tenantCacheGet<(typeof policies.$inferSelect)[]>(
    tenantId,
    'config',
    'policies',
  );
  if (cached) return cached;
  const rows = await db.select().from(policies).where(eq(policies.tenantId, tenantId)).limit(500);
  await tenantCacheSet(tenantId, 'config', 'policies', rows, CONFIG_CACHE_TTL).catch(
    () => undefined,
  );
  return rows;
}

export async function upsertVoiceProfile(tenantId: string, data: Record<string, unknown>) {
  assertTenantAccess(tenantId);
  const mappedData = await replacePaidVoiceWithFreeLiveVoice(mapVoiceProfileInput(data));
  const [existing] = await db
    .select()
    .from(voiceProfile)
    .where(eq(voiceProfile.tenantId, tenantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(voiceProfile)
      .set({ ...mappedData, updatedAt: new Date() } as Partial<VoiceProfileInsert>)
      .where(eq(voiceProfile.tenantId, tenantId))
      .returning();
    await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
    return normalizeVoiceProfile(updated);
  }

  const [created] = await db
    .insert(voiceProfile)
    .values({ id: generateId(), tenantId, ...mappedData } as VoiceProfileInsert)
    .returning();
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
  return normalizeVoiceProfile(created);
}

export async function getVoiceProfile(tenantId: string) {
  assertTenantAccess(tenantId);
  const [profile] = await db
    .select()
    .from(voiceProfile)
    .where(eq(voiceProfile.tenantId, tenantId))
    .limit(1);
  const [clinic] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.tenantId, tenantId))
    .limit(1);
  const normalizedProfile = await replacePaidVoiceWithFreeLiveVoice(profile);
  return normalizeVoiceProfile({
    ...(normalizedProfile ?? {}),
    greetingMessage: normalizeStoredGreetingMessage(
      clinic?.clinicName ?? 'our clinic',
      normalizedProfile?.greetingMessage as string | null | undefined,
    ),
  });
}

export async function addFaq(tenantId: string, data: Record<string, unknown>) {
  assertTenantAccess(tenantId);
  const [faq] = await db
    .insert(faqLibrary)
    .values({ id: generateId(), tenantId, ...data } as FaqLibraryInsert)
    .returning();
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
  return faq;
}

export async function updateFaq(tenantId: string, faqId: string, data: Record<string, unknown>) {
  assertTenantAccess(tenantId);
  const [updated] = await db
    .update(faqLibrary)
    .set({ ...data, updatedAt: new Date() } as Partial<FaqLibraryInsert>)
    .where(and(eq(faqLibrary.id, faqId), eq(faqLibrary.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('FAQ not found');
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
  return updated;
}

export async function deleteFaq(tenantId: string, faqId: string) {
  assertTenantAccess(tenantId);
  await db
    .delete(faqLibrary)
    .where(and(eq(faqLibrary.id, faqId), eq(faqLibrary.tenantId, tenantId)));
  await tenantCacheInvalidateDomain(tenantId, 'config').catch(() => undefined);
}

export async function getFaqs(tenantId: string): Promise<(typeof faqLibrary.$inferSelect)[]> {
  assertTenantAccess(tenantId);
  const cached = await tenantCacheGet<(typeof faqLibrary.$inferSelect)[]>(
    tenantId,
    'config',
    'faqs',
  );
  if (cached) return cached;
  const rows = await db
    .select()
    .from(faqLibrary)
    .where(eq(faqLibrary.tenantId, tenantId))
    .limit(500);
  await tenantCacheSet(tenantId, 'config', 'faqs', rows, CONFIG_CACHE_TTL).catch(() => undefined);
  return rows;
}

export async function createConfigVersion(tenantId: string, userId: string) {
  assertTenantAccess(tenantId);
  const [latest] = await db
    .select({ version: tenantConfigVersions.version })
    .from(tenantConfigVersions)
    .where(eq(tenantConfigVersions.tenantId, tenantId))
    .orderBy(desc(tenantConfigVersions.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  const snapshot = {
    clinic: await getClinicProfile(tenantId),
    services: await getServices(tenantId),
    bookingRules: await getBookingRules(tenantId),
    policies: await getPolicies(tenantId),
    voiceProfile: await getVoiceProfile(tenantId),
    faqs: await getFaqs(tenantId),
  };

  const [version] = await db
    .insert(tenantConfigVersions)
    .values({
      tenantId,
      version: nextVersion,
      status: 'draft',
      snapshot,
      createdBy: userId,
    })
    .returning();

  logger.info({ tenantId, version: nextVersion }, 'Config version created');
  return version;
}

export async function publishConfigVersion(tenantId: string, versionId: string) {
  assertTenantAccess(tenantId);
  await assertTenantReadyForGoLive(tenantId);
  return await db.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(tenantConfigVersions)
      .where(
        and(eq(tenantConfigVersions.id, versionId), eq(tenantConfigVersions.tenantId, tenantId)),
      )
      .limit(1);

    if (!version) throw new NotFoundError('Config version not found');
    if (version.status !== 'draft') {
      throw new ConflictError(`Cannot publish version in status: ${version.status}`);
    }

    await tx
      .update(tenantConfigVersions)
      .set({ status: 'rolled_back' })
      .where(
        and(
          eq(tenantConfigVersions.tenantId, tenantId),
          eq(tenantConfigVersions.status, 'published'),
        ),
      );

    const [published] = await tx
      .update(tenantConfigVersions)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(tenantConfigVersions.id, versionId))
      .returning();

    const [existingActive] = await tx
      .select()
      .from(tenantActiveConfig)
      .where(eq(tenantActiveConfig.tenantId, tenantId))
      .limit(1);

    if (existingActive) {
      await tx
        .update(tenantActiveConfig)
        .set({ activeVersion: published.version, activatedAt: new Date() })
        .where(eq(tenantActiveConfig.tenantId, tenantId));
    } else {
      await tx.insert(tenantActiveConfig).values({
        tenantId,
        activeVersion: published.version,
        activatedBy: 'system',
      });
    }

    await cache.invalidateTenantDomain(tenantId, 'ai');
    await cache.invalidateTenantDomain(tenantId, 'config');

    logger.info({ tenantId, version: published.version }, 'Config version published');
    return published;
  });
}

export async function getConfigVersions(tenantId: string) {
  assertTenantAccess(tenantId);
  return await db
    .select()
    .from(tenantConfigVersions)
    .where(eq(tenantConfigVersions.tenantId, tenantId))
    .orderBy(desc(tenantConfigVersions.version));
}
