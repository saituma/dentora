
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
import { cache } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError, ConfigValidationError, ConflictError } from '../../lib/errors.js';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export async function upsertClinicProfile(tenantId: string, data: Record<string, unknown>) {
  const [existing] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.tenantId, tenantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(clinicProfile)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(clinicProfile.tenantId, tenantId))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(clinicProfile)
    .values({ id: generateId(), tenantId, ...data } as any)
    .returning();
  return created;
}

export async function getClinicProfile(tenantId: string) {
  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.tenantId, tenantId))
    .limit(1);
  return profile ?? null;
}

export async function addService(tenantId: string, data: Record<string, unknown>) {
  const [svc] = await db
    .insert(services)
    .values({ id: generateId(), tenantId, ...data } as any)
    .returning();
  return svc;
}

export async function updateService(tenantId: string, serviceId: string, data: Record<string, unknown>) {
  const [updated] = await db
    .update(services)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(services.id, serviceId), eq(services.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('Service not found');
  return updated;
}

export async function deleteService(tenantId: string, serviceId: string) {
  await db.delete(services).where(and(eq(services.id, serviceId), eq(services.tenantId, tenantId)));
}

export async function getServices(tenantId: string) {
  return await db.select().from(services).where(eq(services.tenantId, tenantId));
}

export async function upsertBookingRules(tenantId: string, data: Record<string, unknown>) {
  const [existing] = await db
    .select()
    .from(bookingRules)
    .where(eq(bookingRules.tenantId, tenantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(bookingRules)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(bookingRules.tenantId, tenantId))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(bookingRules)
    .values({ id: generateId(), tenantId, ...data } as any)
    .returning();
  return created;
}

export async function getBookingRules(tenantId: string) {
  const [rules] = await db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1);
  return rules ?? null;
}

export async function addPolicy(tenantId: string, data: Record<string, unknown>) {
  const [policy] = await db
    .insert(policies)
    .values({ id: generateId(), tenantId, ...data } as any)
    .returning();
  return policy;
}

export async function updatePolicy(tenantId: string, policyId: string, data: Record<string, unknown>) {
  const [updated] = await db
    .update(policies)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(policies.id, policyId), eq(policies.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('Policy not found');
  return updated;
}

export async function deletePolicy(tenantId: string, policyId: string) {
  await db.delete(policies).where(and(eq(policies.id, policyId), eq(policies.tenantId, tenantId)));
}

export async function getPolicies(tenantId: string) {
  return await db.select().from(policies).where(eq(policies.tenantId, tenantId));
}

export async function upsertVoiceProfile(tenantId: string, data: Record<string, unknown>) {
  const [existing] = await db
    .select()
    .from(voiceProfile)
    .where(eq(voiceProfile.tenantId, tenantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(voiceProfile)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(voiceProfile.tenantId, tenantId))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(voiceProfile)
    .values({ id: generateId(), tenantId, ...data } as any)
    .returning();
  return created;
}

export async function getVoiceProfile(tenantId: string) {
  const [profile] = await db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1);
  return profile ?? null;
}

export async function addFaq(tenantId: string, data: Record<string, unknown>) {
  const [faq] = await db
    .insert(faqLibrary)
    .values({ id: generateId(), tenantId, ...data } as any)
    .returning();
  return faq;
}

export async function updateFaq(tenantId: string, faqId: string, data: Record<string, unknown>) {
  const [updated] = await db
    .update(faqLibrary)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(faqLibrary.id, faqId), eq(faqLibrary.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('FAQ not found');
  return updated;
}

export async function deleteFaq(tenantId: string, faqId: string) {
  await db.delete(faqLibrary).where(and(eq(faqLibrary.id, faqId), eq(faqLibrary.tenantId, tenantId)));
}

export async function getFaqs(tenantId: string) {
  return await db.select().from(faqLibrary).where(eq(faqLibrary.tenantId, tenantId));
}

export async function createConfigVersion(tenantId: string, userId: string) {
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
  return await db.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(tenantConfigVersions)
      .where(and(eq(tenantConfigVersions.id, versionId), eq(tenantConfigVersions.tenantId, tenantId)))
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
  return await db
    .select()
    .from(tenantConfigVersions)
    .where(eq(tenantConfigVersions.tenantId, tenantId))
    .orderBy(desc(tenantConfigVersions.version));
}
