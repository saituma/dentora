
import { z } from 'zod';

export const ProviderRegistrySchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().min(1).max(50),
  providerType: z.enum(['stt', 'tts', 'llm']),
  displayName: z.string().min(1),
  enabled: z.boolean(),
  priority: z.number().int().min(0),
  config: z.record(z.unknown()).default({}),
  capabilities: z.object({
    languages: z.array(z.string()),
    features: z.array(z.string()),
    maxInputSize: z.number().int().positive(),
    streamingSupported: z.boolean(),
  }),
  maxConcurrency: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const ProviderPricingSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string(),
  operation: z.string(),
  unitType: z.string(),
  unitCostUsd: z.number().min(0),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date().nullable().default(null),
  createdAt: z.coerce.date(),
});

export type ProviderRegistryInput = z.infer<typeof ProviderRegistrySchema>;
export type ProviderPricingInput = z.infer<typeof ProviderPricingSchema>;
