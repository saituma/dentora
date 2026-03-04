
import { z } from 'zod';

export const PolicySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  escalationConditions: z.record(z.unknown()),
  emergencyDisclaimer: z.string().min(10),
  sensitiveTopics: z.array(z.string()),
  humanCallbackSlaMinutes: z.number().int().min(5).max(240),
  complianceFlags: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreatePolicySchema = PolicySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PolicyInput = z.infer<typeof PolicySchema>;
export type CreatePolicyInput = z.infer<typeof CreatePolicySchema>;
