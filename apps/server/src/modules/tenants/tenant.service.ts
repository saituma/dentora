
import { db } from '../../db/index.js';
import {
  tenantRegistry,
  tenantConfigVersions,
  tenantActiveConfig,
  users,
  tenantUsers,
} from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { hashPassword, generateId } from '../../lib/crypto.js';
import { cache } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { TenantNotFoundError, ConflictError } from '../../lib/errors.js';
import type { InferSelectModel } from 'drizzle-orm';

type Tenant = InferSelectModel<typeof tenantRegistry>;

export async function createTenant(input: {
  clinicName: string;
  ownerEmail: string;
  ownerPassword: string;
  plan?: string;
}): Promise<{ tenant: Tenant; userId: string }> {
  const tenantId = generateId();
  const userId = generateId();

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.ownerEmail))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError('Email already registered');
    }

    const [tenant] = await tx
      .insert(tenantRegistry)
      .values({
        id: tenantId,
        clinicName: input.clinicName,
        clinicSlug: input.clinicName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        plan: (input.plan as 'starter' | 'professional' | 'enterprise') ?? 'starter',
        status: 'active',
      })
      .returning();

    const passwordHash = await hashPassword(input.ownerPassword);
    await tx.insert(users).values({
      id: userId,
      email: input.ownerEmail,
      passwordHash,
      displayName: input.clinicName,
      role: 'owner',
    });

    await tx.insert(tenantUsers).values({
      tenantId,
      userId,
      role: 'owner',
    });

    await tx.insert(tenantConfigVersions).values({
      tenantId,
      version: 1,
      status: 'draft',
      snapshot: {},
      createdBy: userId,
    });

    logger.info({ tenantId }, 'Tenant created');
    return { tenant, userId };
  });
}

export async function getTenantById(tenantId: string): Promise<Tenant> {
  const cached = await cache.getTenantScoped(tenantId, 'registry', 'info');
  if (cached) return JSON.parse(cached) as Tenant;

  const [tenant] = await db
    .select()
    .from(tenantRegistry)
    .where(eq(tenantRegistry.id, tenantId))
    .limit(1);

  if (!tenant) throw new TenantNotFoundError(tenantId);

  await cache.setTenantScoped(tenantId, 'registry', 'info', JSON.stringify(tenant), 300);
  return tenant;
}

export async function updateTenantStatus(
  tenantId: string,
  status: 'active' | 'suspended' | 'archived',
): Promise<Tenant> {
  const [updated] = await db
    .update(tenantRegistry)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenantRegistry.id, tenantId))
    .returning();

  if (!updated) throw new TenantNotFoundError(tenantId);

  await cache.invalidateTenantDomain(tenantId, 'registry');

  logger.info({ tenantId, status }, 'Tenant status updated');
  return updated;
}

export async function listTenants(opts: { limit: number; offset: number }) {
  const results = await db
    .select()
    .from(tenantRegistry)
    .orderBy(desc(tenantRegistry.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);

  return results;
}

export async function getTenantConfig(tenantId: string) {
  const [active] = await db
    .select()
    .from(tenantActiveConfig)
    .where(eq(tenantActiveConfig.tenantId, tenantId))
    .limit(1);

  if (!active) return null;

  const [version] = await db
    .select()
    .from(tenantConfigVersions)
    .where(
      and(
        eq(tenantConfigVersions.tenantId, tenantId),
        eq(tenantConfigVersions.version, active.activeVersion),
      ),
    )
    .limit(1);

  return version;
}
