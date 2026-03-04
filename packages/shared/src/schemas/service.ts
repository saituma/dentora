
import { z } from 'zod';
import { SERVICE_DURATION_MIN, SERVICE_DURATION_MAX } from '../constants/limits.js';

export const ServiceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  serviceCode: z.string().min(1).max(50),
  serviceName: z.string().min(1).max(120),
  serviceCategory: z.enum([
    'preventive', 'restorative', 'cosmetic',
    'emergency', 'orthodontic', 'other',
  ]),
  durationMinutes: z.number().int().min(SERVICE_DURATION_MIN).max(SERVICE_DURATION_MAX),
  newPatientAllowed: z.boolean(),
  requiresStaffApproval: z.boolean(),
  bookingConstraints: z.record(z.unknown()).default({}),
  active: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateServiceSchema = ServiceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ServiceInput = z.infer<typeof ServiceSchema>;
export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;
