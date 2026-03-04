
import { z } from 'zod';

export const TenantRegistrySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  clinicSlug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  status: z.enum(['active', 'suspended', 'archived']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateTenantSchema = z.object({
  clinicSlug: TenantRegistrySchema.shape.clinicSlug,
});

export type TenantRegistryInput = z.infer<typeof TenantRegistrySchema>;
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

export const TenantConfigVersionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  status: z.enum(['draft', 'validated', 'published', 'rolled_back']),
  source: z.enum(['onboarding', 'ai_chat', 'admin_edit']),
  completenessScore: z.number().min(0).max(100),
  validationReport: z.record(z.unknown()),
  publishedAt: z.coerce.date().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
});

export type TenantConfigVersionInput = z.infer<typeof TenantConfigVersionSchema>;

export const TenantActiveConfigSchema = z.object({
  tenantId: z.string().uuid(),
  activeVersionNumber: z.number().int().positive(),
  activatedAt: z.coerce.date(),
  activatedBy: z.string().uuid(),
});

export type TenantActiveConfigInput = z.infer<typeof TenantActiveConfigSchema>;

export const TenantContextSchema = z.object({
  tenantId: z.string().uuid(),
  clinicSlug: z.string(),
  status: z.enum(['active', 'suspended', 'archived']),
  activeConfigVersion: z.number().int().positive(),
  resolvedVia: z.enum(['jwt', 'phone_number', 'api_key', 'admin_override']),
  correlationId: z.string(),
  requestedAt: z.string().datetime(),
});

export type TenantContext = z.infer<typeof TenantContextSchema>;
