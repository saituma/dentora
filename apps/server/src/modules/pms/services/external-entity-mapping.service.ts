import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { externalEntityMappings } from '../../../db/schema.js';
import { assertTenantAccess } from '../../../db/tenant-context.js';
import { generateId } from '../../../lib/crypto.js';
import { ValidationError } from '../../../lib/errors.js';
import type { ExternalEntityType, SchedulingProviderKey } from '../domain/appointment.types.js';
import { isExternalEntityType, isSchedulingProvider } from '../domain/appointment.types.js';

export type ExternalEntityMapping = typeof externalEntityMappings.$inferSelect;

export interface CreateExternalEntityMappingInput {
  tenantId: string;
  localEntityType: ExternalEntityType;
  localEntityId: string;
  externalProvider: SchedulingProviderKey;
  externalEntityType: ExternalEntityType;
  externalEntityId: string;
  integrationId: string;
  metadata?: Record<string, unknown>;
}

export async function findExternalEntityMapping(input: {
  tenantId: string;
  externalProvider: SchedulingProviderKey;
  externalEntityType: ExternalEntityType;
  externalEntityId: string;
  integrationId: string;
}): Promise<ExternalEntityMapping | null> {
  assertTenantAccess(input.tenantId);
  const [mapping] = await db
    .select()
    .from(externalEntityMappings)
    .where(
      and(
        eq(externalEntityMappings.tenantId, input.tenantId),
        eq(externalEntityMappings.externalProvider, input.externalProvider),
        eq(externalEntityMappings.externalEntityType, input.externalEntityType),
        eq(externalEntityMappings.externalEntityId, input.externalEntityId),
        eq(externalEntityMappings.integrationId, input.integrationId),
      ),
    )
    .limit(1);

  return mapping ?? null;
}

export async function listExternalEntityMappingsForLocalEntity(input: {
  tenantId: string;
  localEntityType: ExternalEntityType;
  localEntityId: string;
}): Promise<ExternalEntityMapping[]> {
  assertTenantAccess(input.tenantId);
  return await db
    .select()
    .from(externalEntityMappings)
    .where(
      and(
        eq(externalEntityMappings.tenantId, input.tenantId),
        eq(externalEntityMappings.localEntityType, input.localEntityType),
        eq(externalEntityMappings.localEntityId, input.localEntityId),
      ),
    );
}

export async function createExternalEntityMapping(
  input: CreateExternalEntityMappingInput,
): Promise<ExternalEntityMapping> {
  assertTenantAccess(input.tenantId);
  if (!isExternalEntityType(input.localEntityType)) {
    throw new ValidationError('Invalid local entity type');
  }
  if (!isSchedulingProvider(input.externalProvider)) {
    throw new ValidationError('Invalid external provider');
  }
  if (!isExternalEntityType(input.externalEntityType)) {
    throw new ValidationError('Invalid external entity type');
  }

  const existing = await findExternalEntityMapping({
    tenantId: input.tenantId,
    externalProvider: input.externalProvider,
    externalEntityType: input.externalEntityType,
    externalEntityId: input.externalEntityId,
    integrationId: input.integrationId,
  });

  if (existing) {
    if (
      existing.localEntityType === input.localEntityType &&
      existing.localEntityId === input.localEntityId
    ) {
      return existing;
    }

    throw new ValidationError('External entity is already mapped to another local entity');
  }

  const [created] = await db
    .insert(externalEntityMappings)
    .values({
      id: generateId(),
      tenantId: input.tenantId,
      localEntityType: input.localEntityType,
      localEntityId: input.localEntityId,
      externalProvider: input.externalProvider,
      externalEntityType: input.externalEntityType,
      externalEntityId: input.externalEntityId,
      integrationId: input.integrationId,
      metadata: input.metadata ?? {},
    })
    .returning();

  if (!created) {
    throw new ValidationError('Failed to create external entity mapping');
  }

  return created;
}
