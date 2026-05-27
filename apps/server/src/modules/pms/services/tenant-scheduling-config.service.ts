import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { integrations, tenantSchedulingConfig } from '../../../db/schema.js';
import { assertTenantAccess } from '../../../db/tenant-context.js';
import { generateId } from '../../../lib/crypto.js';
import { NotFoundError, ValidationError } from '../../../lib/errors.js';
import type {
  GoogleSyncMode,
  SchedulingProviderKey,
  SchedulingSourceOfTruth,
} from '../domain/appointment.types.js';
import {
  isGoogleSyncMode,
  isSchedulingProvider,
  isSchedulingSourceOfTruth,
} from '../domain/appointment.types.js';

export type TenantSchedulingConfig = typeof tenantSchedulingConfig.$inferSelect;

export interface UpsertTenantSchedulingConfigInput {
  tenantId: string;
  primaryProvider: SchedulingProviderKey;
  primaryIntegrationId: string;
  fallbackProvider?: SchedulingProviderKey | null;
  fallbackIntegrationId?: string | null;
  sourceOfTruth: SchedulingSourceOfTruth;
  googleSyncMode: GoogleSyncMode;
}

async function assertIntegrationMatchesProvider(input: {
  tenantId: string;
  integrationId: string;
  provider: SchedulingProviderKey;
  role: 'primary' | 'fallback';
}): Promise<void> {
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.tenantId, input.tenantId), eq(integrations.id, input.integrationId)))
    .limit(1);

  if (!integration) {
    throw new NotFoundError(`Scheduling ${input.role} integration not found`);
  }

  if (integration.provider !== input.provider) {
    throw new ValidationError(
      `Scheduling ${input.role} integration provider does not match config`,
    );
  }
}

export async function getTenantSchedulingConfig(
  tenantId: string,
): Promise<TenantSchedulingConfig | null> {
  assertTenantAccess(tenantId);
  const [config] = await db
    .select()
    .from(tenantSchedulingConfig)
    .where(eq(tenantSchedulingConfig.tenantId, tenantId))
    .limit(1);

  return config ?? null;
}

export async function upsertTenantSchedulingConfig(
  input: UpsertTenantSchedulingConfigInput,
): Promise<TenantSchedulingConfig> {
  assertTenantAccess(input.tenantId);
  if (!isSchedulingProvider(input.primaryProvider)) {
    throw new ValidationError('Invalid primary scheduling provider');
  }
  if (input.fallbackProvider && !isSchedulingProvider(input.fallbackProvider)) {
    throw new ValidationError('Invalid fallback scheduling provider');
  }
  if (!isSchedulingSourceOfTruth(input.sourceOfTruth)) {
    throw new ValidationError('Invalid scheduling source of truth');
  }
  if (!isGoogleSyncMode(input.googleSyncMode)) {
    throw new ValidationError('Invalid Google sync mode');
  }

  await assertIntegrationMatchesProvider({
    tenantId: input.tenantId,
    integrationId: input.primaryIntegrationId,
    provider: input.primaryProvider,
    role: 'primary',
  });

  if (input.fallbackProvider || input.fallbackIntegrationId) {
    if (!input.fallbackProvider || !input.fallbackIntegrationId) {
      throw new ValidationError('Fallback provider and integration id must be configured together');
    }

    await assertIntegrationMatchesProvider({
      tenantId: input.tenantId,
      integrationId: input.fallbackIntegrationId,
      provider: input.fallbackProvider,
      role: 'fallback',
    });
  }

  const existing = await getTenantSchedulingConfig(input.tenantId);
  const values = {
    primaryProvider: input.primaryProvider,
    primaryIntegrationId: input.primaryIntegrationId,
    fallbackProvider: input.fallbackProvider ?? null,
    fallbackIntegrationId: input.fallbackIntegrationId ?? null,
    sourceOfTruth: input.sourceOfTruth,
    googleSyncMode: input.googleSyncMode,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(tenantSchedulingConfig)
      .set(values)
      .where(eq(tenantSchedulingConfig.id, existing.id))
      .returning();

    if (!updated) {
      throw new NotFoundError('Scheduling config not found');
    }

    return updated;
  }

  const [created] = await db
    .insert(tenantSchedulingConfig)
    .values({
      id: generateId(),
      tenantId: input.tenantId,
      ...values,
    })
    .returning();

  if (!created) {
    throw new ValidationError('Failed to create scheduling config');
  }

  return created;
}
