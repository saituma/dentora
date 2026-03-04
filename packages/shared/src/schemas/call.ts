
import { z } from 'zod';

export const CallSessionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  twilioNumberId: z.string().uuid(),
  telephonyCallId: z.string().min(1),
  callerPhone: z.string().nullable().default(null),
  status: z.enum(['started', 'in_progress', 'completed', 'escalated', 'failed']),
  intentSummary: z.string().nullable().default(null),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable().default(null),
});

export type CallSessionInput = z.infer<typeof CallSessionSchema>;

export const CallEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  callSessionId: z.string().uuid(),
  eventType: z.string().min(1),
  eventPayload: z.record(z.unknown()),
  createdAt: z.coerce.date(),
});

export type CallEventInput = z.infer<typeof CallEventSchema>;

export const CallCostSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  callSessionId: z.string().uuid(),
  sttProvider: z.string(),
  ttsProvider: z.string(),
  llmProvider: z.string(),
  sttCostUsd: z.number().min(0),
  ttsCostUsd: z.number().min(0),
  llmCostUsd: z.number().min(0),
  telephonyCostUsd: z.number().min(0),
  totalCostUsd: z.number().min(0),
  createdAt: z.coerce.date(),
});

export type CallCostInput = z.infer<typeof CallCostSchema>;

export const CallCostLineItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  callSessionId: z.string().uuid(),
  callCostId: z.string().uuid(),
  providerId: z.string(),
  providerType: z.enum(['stt', 'tts', 'llm', 'telephony']),
  operation: z.string(),
  inputUnits: z.number().min(0),
  unitType: z.string(),
  unitCostUsd: z.number().min(0),
  totalCostUsd: z.number().min(0),
  latencyMs: z.number().int().min(0),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.coerce.date(),
});

export type CallCostLineItemInput = z.infer<typeof CallCostLineItemSchema>;
