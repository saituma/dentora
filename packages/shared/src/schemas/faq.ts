
import { z } from 'zod';
import { FAQ_CONFIDENCE_THRESHOLD_MIN, FAQ_CONFIDENCE_THRESHOLD_MAX } from '../constants/limits.js';

export const FaqEntrySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  faqKey: z.string().min(1).max(64),
  questionVariants: z.array(z.string()).min(1),
  canonicalAnswer: z.string().min(1),
  category: z.enum([
    'insurance', 'hours', 'procedures',
    'billing', 'preparation', 'other',
  ]),
  escalationIfUncertain: z.boolean(),
  confidenceThreshold: z.number().min(FAQ_CONFIDENCE_THRESHOLD_MIN).max(FAQ_CONFIDENCE_THRESHOLD_MAX),
  active: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateFaqEntrySchema = FaqEntrySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type FaqEntryInput = z.infer<typeof FaqEntrySchema>;
export type CreateFaqEntryInput = z.infer<typeof CreateFaqEntrySchema>;
