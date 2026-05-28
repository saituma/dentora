
import { z } from 'zod';

export const SchedulingProviderSchema = z.enum([
  'google_calendar',
  'dentally',
  'soe_exact',
  'cs_r4_plus',
]);

export const SchedulingSourceOfTruthSchema = z.enum([
  'google_calendar',
  'pms',
  'local_ledger',
]);

export const GoogleSyncModeSchema = z.enum([
  'disabled',
  'mirror_busy',
  'mirror_full',
  'fallback_only',
]);

export const ExternalEntityTypeSchema = z.enum([
  'appointment',
  'patient',
  'clinician',
  'room',
  'service',
  'treatment_type',
]);

export const IntegrationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  integrationType: z.enum(['scheduling', 'pms', 'calendar', 'crm', 'messaging']),
  provider: z.string().min(1),
  status: z.enum(['disconnected', 'pending', 'active', 'error']),
  credentialRef: z.string().min(1),
  capabilities: z.record(z.string(), z.unknown()),
  healthLastCheckedAt: z.coerce.date().nullable().default(null),
  healthStatus: z.enum(['healthy', 'degraded', 'failing']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateIntegrationSchema = IntegrationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const TenantSchedulingConfigSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  primaryProvider: SchedulingProviderSchema,
  primaryIntegrationId: z.string().uuid(),
  fallbackProvider: SchedulingProviderSchema.nullable().default(null),
  fallbackIntegrationId: z.string().uuid().nullable().default(null),
  sourceOfTruth: SchedulingSourceOfTruthSchema,
  googleSyncMode: GoogleSyncModeSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateTenantSchedulingConfigSchema = TenantSchedulingConfigSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const ExternalEntityMappingSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  localEntityType: ExternalEntityTypeSchema,
  localEntityId: z.string().min(1),
  externalProvider: SchedulingProviderSchema,
  externalEntityType: ExternalEntityTypeSchema,
  externalEntityId: z.string().min(1),
  integrationId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateExternalEntityMappingSchema = ExternalEntityMappingSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type IntegrationInput = z.infer<typeof IntegrationSchema>;
export type CreateIntegrationInput = z.infer<typeof CreateIntegrationSchema>;
export type SchedulingProviderInput = z.infer<typeof SchedulingProviderSchema>;
export type SchedulingSourceOfTruthInput = z.infer<typeof SchedulingSourceOfTruthSchema>;
export type GoogleSyncModeInput = z.infer<typeof GoogleSyncModeSchema>;
export type ExternalEntityTypeInput = z.infer<typeof ExternalEntityTypeSchema>;
export type TenantSchedulingConfigInput = z.infer<typeof TenantSchedulingConfigSchema>;
export type CreateTenantSchedulingConfigInput = z.infer<
  typeof CreateTenantSchedulingConfigSchema
>;
export type ExternalEntityMappingInput = z.infer<typeof ExternalEntityMappingSchema>;
export type CreateExternalEntityMappingInput = z.infer<
  typeof CreateExternalEntityMappingSchema
>;
