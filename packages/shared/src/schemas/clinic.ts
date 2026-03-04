
import { z } from 'zod';

const OperatingHoursSchema = z.object({
  monday: z.object({ open: z.string(), close: z.string() }).nullable(),
  tuesday: z.object({ open: z.string(), close: z.string() }).nullable(),
  wednesday: z.object({ open: z.string(), close: z.string() }).nullable(),
  thursday: z.object({ open: z.string(), close: z.string() }).nullable(),
  friday: z.object({ open: z.string(), close: z.string() }).nullable(),
  saturday: z.object({ open: z.string(), close: z.string() }).nullable(),
  sunday: z.object({ open: z.string(), close: z.string() }).nullable(),
});

const LocationSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(2).max(3),
    zip: z.string().min(5).max(10),
  }),
  operatingHours: OperatingHoursSchema,
  holidayOverrides: z.array(z.object({
    date: z.string(),
    reason: z.string(),
    closed: z.boolean(),
    hours: z.object({ open: z.string(), close: z.string() }).optional(),
  })).default([]),
  afterHoursBehavior: z.enum(['voicemail', 'callback', 'emergency_routing']),
});

export const ClinicProfileSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  clinicName: z.string().min(2).max(120),
  legalEntityName: z.string().min(1),
  timezone: z.string().min(1),
  primaryPhone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be E.164 format'),
  supportEmail: z.string().email(),
  locations: z.array(LocationSchema).min(1),
  status: z.enum(['draft', 'validated', 'published', 'archived']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateClinicProfileSchema = ClinicProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ClinicProfileInput = z.infer<typeof ClinicProfileSchema>;
export type CreateClinicProfileInput = z.infer<typeof CreateClinicProfileSchema>;
export type LocationInput = z.infer<typeof LocationSchema>;
