
import { z } from 'zod';

export const IntegrationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  integrationType: z.enum(['pms', 'calendar', 'crm', 'messaging']),
  provider: z.string().min(1),
  status: z.enum(['disconnected', 'pending', 'active', 'error']),
  credentialRef: z.string().min(1),
  capabilities: z.record(z.unknown()),
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

export type IntegrationInput = z.infer<typeof IntegrationSchema>;
export type CreateIntegrationInput = z.infer<typeof CreateIntegrationSchema>;
