import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate, rateLimiter } from '../../middleware/index.js';
import {
  bookPublicAppointment,
  cancelAppointmentFromRoute,
  checkPublicAppointmentAvailability,
  listUpcomingAppointments,
  rescheduleAppointmentFromRoute,
} from './appointment-application.service.js';

const appointmentsRateLimiter = rateLimiter({
  maxRequests: 120,
  windowSeconds: 60,
  keyPrefix: 'appointments',
});

const availabilitySchema = z.object({
  requestedDate: z.string().min(4),
  requestedTime: z.string().optional().nullable(),
  requestedPeriod: z.enum(['morning', 'afternoon', 'evening']).optional().nullable(),
  appointmentDurationMinutes: z.number().int().min(5).max(240).optional(),
  maxSlots: z.number().int().min(1).max(10).optional(),
  lookAheadDays: z.number().int().min(1).max(30).optional(),
});

const bookingSchema = z.object({
  idempotencyKey: z.string().min(8).optional(),
  slot: z.object({
    startIso: z.string().min(5),
    endIso: z.string().min(5),
  }),
  patient: z.object({
    fullName: z.string().min(2),
    age: z.number().int().min(0).max(120).optional(),
    phoneNumber: z.string().min(7),
    dateOfBirth: z.string().min(4).optional().nullable(),
    reasonForVisit: z.string().min(2),
  }),
});

const cancelSchema = z.object({
  eventId: z.string().min(3),
});

const rescheduleSchema = z.object({
  eventId: z.string().min(3),
  slot: z.object({
    startIso: z.string().min(5),
    endIso: z.string().min(5),
  }),
});

export const appointmentsRouter = Router();

appointmentsRouter.get(
  '/upcoming',
  authenticateJwt,
  resolveTenant,
  appointmentsRateLimiter,
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const lookAheadDays = Number(req.query.days ?? 7);
      const upcoming = await listUpcomingAppointments({
        tenantId,
        days: lookAheadDays,
      });

      res.json({
        data: upcoming,
      });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.post(
  '/availability',
  authenticateJwt,
  resolveTenant,
  appointmentsRateLimiter,
  validate({ body: availabilitySchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const availability = await checkPublicAppointmentAvailability({
        tenantId,
        requestedDate: req.body.requestedDate,
        requestedTime: req.body.requestedTime ?? null,
        requestedPeriod: req.body.requestedPeriod ?? null,
        appointmentDurationMinutes: req.body.appointmentDurationMinutes,
        maxSlots: req.body.maxSlots ?? 5,
        lookAheadDays: req.body.lookAheadDays ?? 14,
      });

      res.json({
        data: {
          exactMatch: availability.exactMatch,
          suggestedSlots: availability.suggestedSlots,
          timezone: availability.timezone,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.post(
  '/book',
  authenticateJwt,
  resolveTenant,
  appointmentsRateLimiter,
  validate({ body: bookingSchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const appointment = await bookPublicAppointment({
        tenantId,
        slot: req.body.slot,
        patient: req.body.patient,
        idempotencyKey: req.body.idempotencyKey,
      });

      res.json({
        data: {
          eventId: appointment.eventId,
          htmlLink: appointment.htmlLink,
          slot: appointment.slot,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.post(
  '/cancel',
  authenticateJwt,
  resolveTenant,
  appointmentsRateLimiter,
  validate({ body: cancelSchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;

      const result = await cancelAppointmentFromRoute({
        tenantId,
        eventId: req.body.eventId,
      });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.post(
  '/reschedule',
  authenticateJwt,
  resolveTenant,
  appointmentsRateLimiter,
  validate({ body: rescheduleSchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const result = await rescheduleAppointmentFromRoute({
        tenantId,
        eventId: req.body.eventId,
        slot: req.body.slot,
      });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);
