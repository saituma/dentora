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
import { dentallyVerificationService } from '../adapters/dentally/dentally-verification.service.js';
import { isVendorShellProvider } from '../adapters/vendor-readiness.js';

export type TenantSchedulingConfig = typeof tenantSchedulingConfig.$inferSelect;

const DENTALLY_READY_RECOMMENDATIONS = new Set(['SANDBOX VERIFIED', 'CONTROLLED PILOT READY']);

function assertProviderCanBeSelectedForScheduling(
  provider: SchedulingProviderKey,
  role: 'primary' | 'fallback',
): void {
  if (!isVendorShellProvider(provider)) return;
  throw new ValidationError(
    `${provider} cannot be selected as scheduling ${role} provider until the live vendor adapter is implemented and sandbox contract tests pass`,
  );
}

export interface UpsertTenantSchedulingConfigInput {
  tenantId: string;
  primaryProvider: SchedulingProviderKey;
  primaryIntegrationId: string;
  fallbackProvider?: SchedulingProviderKey | null;
  fallbackIntegrationId?: string | null;
  sourceOfTruth: SchedulingSourceOfTruth;
  googleSyncMode: GoogleSyncMode;
}

export interface UpdateTenantSchedulingConfigInput {
  tenantId: string;
  primaryProvider?: SchedulingProviderKey;
  primaryIntegrationId?: string | null;
  fallbackProvider?: SchedulingProviderKey | null;
  fallbackIntegrationId?: string | null;
  sourceOfTruth?: SchedulingSourceOfTruth;
  googleSyncMode?: GoogleSyncMode;
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

async function assertDentallyReadyForScheduling(input: {
  tenantId: string;
  integrationId: string;
  role: 'primary' | 'fallback';
}): Promise<void> {
  const report = await dentallyVerificationService.generateVerificationReport({
    tenantId: input.tenantId,
    integrationId: input.integrationId,
  });
  if (
    !DENTALLY_READY_RECOMMENDATIONS.has(report.productionRecommendation) ||
    report.productionBlockers.length > 0
  ) {
    throw new ValidationError(
      `Dentally cannot be selected as scheduling ${input.role} provider until sandbox verification is ready`,
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
  assertProviderCanBeSelectedForScheduling(input.primaryProvider, 'primary');
  if (input.fallbackProvider) {
    assertProviderCanBeSelectedForScheduling(input.fallbackProvider, 'fallback');
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
  if (input.primaryProvider === 'dentally') {
    await assertDentallyReadyForScheduling({
      tenantId: input.tenantId,
      integrationId: input.primaryIntegrationId,
      role: 'primary',
    });
  }

  if (input.fallbackProvider || input.fallbackIntegrationId) {
    if (!input.fallbackProvider || !input.fallbackIntegrationId) {
      throw new ValidationError('Fallback provider and integration id must be configured together');
    }
    if (input.fallbackProvider === input.primaryProvider) {
      throw new ValidationError('Fallback provider must differ from primary provider');
    }
    if (input.fallbackIntegrationId === input.primaryIntegrationId) {
      throw new ValidationError('Fallback integration must differ from primary integration');
    }

    await assertIntegrationMatchesProvider({
      tenantId: input.tenantId,
      integrationId: input.fallbackIntegrationId,
      provider: input.fallbackProvider,
      role: 'fallback',
    });
    if (input.fallbackProvider === 'dentally') {
      await assertDentallyReadyForScheduling({
        tenantId: input.tenantId,
        integrationId: input.fallbackIntegrationId,
        role: 'fallback',
      });
    }
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

export async function updateTenantSchedulingConfig(
  input: UpdateTenantSchedulingConfigInput,
): Promise<TenantSchedulingConfig> {
  assertTenantAccess(input.tenantId);
  const existing = await getTenantSchedulingConfig(input.tenantId);
  if (!existing && (!input.primaryProvider || !input.primaryIntegrationId)) {
    throw new ValidationError('Primary provider and integration id are required');
  }

  const primaryProvider = input.primaryProvider ?? existing!.primaryProvider;
  const primaryIntegrationId = input.primaryIntegrationId ?? existing!.primaryIntegrationId;
  const fallbackProvider =
    input.fallbackProvider === undefined
      ? (existing?.fallbackProvider ?? null)
      : input.fallbackProvider;
  const fallbackIntegrationId =
    input.fallbackIntegrationId === undefined
      ? (existing?.fallbackIntegrationId ?? null)
      : input.fallbackIntegrationId;
  const sourceOfTruth = input.sourceOfTruth ?? existing?.sourceOfTruth ?? 'local_ledger';
  const googleSyncMode = input.googleSyncMode ?? existing?.googleSyncMode ?? 'fallback_only';

  if (!primaryIntegrationId) {
    throw new ValidationError('Primary integration id is required');
  }

  return await upsertTenantSchedulingConfig({
    tenantId: input.tenantId,
    primaryProvider,
    primaryIntegrationId,
    fallbackProvider,
    fallbackIntegrationId,
    sourceOfTruth,
    googleSyncMode,
  });
}
