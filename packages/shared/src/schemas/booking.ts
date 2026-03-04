
import { z } from 'zod';

export const BookingRulesSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  minNoticeHours: z.number().int().min(0).max(720),
  maxFutureDays: z.number().int().min(1).max(365),
  cancellationCutoffHours: z.number().int().min(0).max(720),
  doubleBookingPolicy: z.enum(['forbid', 'conditional', 'manual_review']),
  emergencySlotPolicy: z.record(z.unknown()),
  rescheduleLimits: z.record(z.unknown()).nullable().default(null),
  afterHoursPolicy: z.record(z.unknown()),
  validationState: z.enum(['valid', 'warning', 'blocked']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).refine(
  (data) => data.minNoticeHours < data.maxFutureDays * 24,
  {
    message: 'min_notice_hours must be less than max_future_days × 24',
    path: ['minNoticeHours'],
  }
);

export const CreateBookingRulesSchema = BookingRulesSchema.innerType().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BookingRulesInput = z.infer<typeof BookingRulesSchema>;
export type CreateBookingRulesInput = z.infer<typeof CreateBookingRulesSchema>;
