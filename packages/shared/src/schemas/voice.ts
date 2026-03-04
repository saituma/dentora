
import { z } from 'zod';
import { SPEAKING_SPEED_MIN, SPEAKING_SPEED_MAX } from '../constants/limits.js';

export const VoiceProfileSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  voiceId: z.string().min(1),
  speakingSpeed: z.number().min(SPEAKING_SPEED_MIN).max(SPEAKING_SPEED_MAX),
  tone: z.enum(['calm', 'friendly', 'professional', 'urgent']),
  pronunciationHints: z.record(z.string()).nullable().default(null),
  fallbackVoiceId: z.string().nullable().default(null),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateVoiceProfileSchema = VoiceProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type VoiceProfileInput = z.infer<typeof VoiceProfileSchema>;
export type CreateVoiceProfileInput = z.infer<typeof CreateVoiceProfileSchema>;
