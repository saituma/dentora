import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate, rateLimiter } from '../../middleware/index.js';
import * as configService from '../config/config.service.js';
import {
  findAvailableCalendarSlots,
  createGoogleCalendarAppointment,
  getActiveGoogleCalendarIntegration,
  cancelGoogleCalendarAppointment,
  rescheduleGoogleCalendarAppointment,
} from '../integrations/integration.service.js';
import { upsertPatientProfile } from '../patients/patients.service.js';
import { resolveValidGoogleAccessToken } from '../integrations/google-calendar.shared.js';
import { ValidationError } from '../../lib/errors.js';

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
      const integration = await getActiveGoogleCalendarIntegration(tenantId);
      if (!integration) {
        throw new ValidationError('Google Calendar is not connected for this clinic');
      }

      const { accessToken } = await resolveValidGoogleAccessToken(integration);
      const config = (integration.config ?? {}) as Record<string, unknown>;
      const calendarId = typeof config.calendarId === 'string' && config.calendarId.trim()
        ? config.calendarId
        : 'primary';

      const lookAheadDays = Number(req.query.days ?? 7);
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + lookAheadDays * 24 * 60 * 60 * 1000).toISOString();

      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set('timeMin', timeMin);
      url.searchParams.set('timeMax', timeMax);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '50');

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ValidationError(`Failed to load calendar events: ${errorBody.slice(0, 300)}`);
      }

      const payload = await response.json() as {
        items?: Array<{
          id?: string;
          summary?: string;
          description?: string;
          htmlLink?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
          status?: string;
        }>;
      };

      res.json({
        data: {
          calendarId,
          events: (payload.items ?? []).map((event) => ({
            id: event.id ?? '',
            summary: event.summary ?? 'Appointment',
            description: event.description ?? '',
            htmlLink: event.htmlLink,
            start: event.start?.dateTime ?? event.start?.date ?? '',
            end: event.end?.dateTime ?? event.end?.date ?? '',
            status: event.status ?? 'confirmed',
          })),
        },
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
      const clinic = await configService.getClinicProfile(tenantId);
      const rules = await configService.getBookingRules(tenantId);

      if (!clinic?.timezone) {
        throw new ValidationError('Clinic timezone is required to check availability');
      }

      const closedDates = Array.isArray(rules?.closedDates)
        ? rules?.closedDates.filter((value): value is string => typeof value === 'string')
        : null;

      const availability = await findAvailableCalendarSlots({
        tenantId,
        timezone: clinic.timezone,
        requestedDate: req.body.requestedDate,
        requestedTime: req.body.requestedTime ?? null,
        requestedPeriod: req.body.requestedPeriod ?? null,
        appointmentDurationMinutes: req.body.appointmentDurationMinutes
          ?? rules?.defaultAppointmentDurationMinutes
          ?? 30,
        bufferBetweenAppointmentsMinutes: rules?.bufferBetweenAppointmentsMinutes ?? 0,
        operatingSchedule: rules?.operatingSchedule ?? clinic.businessHours ?? null,
        closedDates,
        maxSlots: req.body.maxSlots ?? 5,
        lookAheadDays: req.body.lookAheadDays ?? 14,
      });

      res.json({
        data: {
          exactMatch: availability.exactMatch,
          suggestedSlots: availability.suggestedSlots,
          timezone: clinic.timezone,
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
      const clinic = await configService.getClinicProfile(tenantId);
      const rules = await configService.getBookingRules(tenantId);

      if (!clinic?.timezone) {
        throw new ValidationError('Clinic timezone is required to book appointments');
      }

      const startAt = new Date(req.body.slot.startIso);
      const endAt = new Date(req.body.slot.endIso);
      if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
        throw new ValidationError('Appointment start/end times are invalid');
      }

      const now = Date.now();
      const minNoticeHours = rules?.minNoticePeriodHours ?? 2;
      const maxAdvanceDays = rules?.maxAdvanceBookingDays ?? 30;
      const minStart = now + minNoticeHours * 60 * 60 * 1000;
      const maxStart = now + maxAdvanceDays * 24 * 60 * 60 * 1000;

      const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: clinic.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: clinic.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const startDateLocal = dateFormatter.format(startAt);
      const todayLocal = dateFormatter.format(new Date());
      const tomorrowLocal = dateFormatter.format(new Date(Date.now() + 24 * 60 * 60 * 1000));
      const isToday = startDateLocal === todayLocal;
      const isTomorrow = startDateLocal === tomorrowLocal;

      const nowHour = Number(timeFormatter.formatToParts(new Date()).find((part) => part.type === 'hour')?.value ?? '0');
      const startHour = Number(timeFormatter.formatToParts(startAt).find((part) => part.type === 'hour')?.value ?? '0');

      const reason = String(req.body.patient?.reasonForVisit ?? '').toLowerCase();
      const isEmergency = /\b(emergency|severe|bleeding|trauma|swelling|broken|abscess|infection|fever|uncontrolled)\b/.test(reason);

      if (isEmergency) {
        // Emergency bookings bypass same-day and min-notice restrictions.
      } else if (isToday) {
        if (nowHour >= 12) {
          throw new ValidationError('Same-day appointments are only available when booked in the morning');
        }
        if (startHour < 12) {
          throw new ValidationError('Same-day appointments must be scheduled in the afternoon');
        }
      } else if (!isTomorrow) {
        // No min-notice enforcement
      }
      if (startAt.getTime() > maxStart) {
        throw new ValidationError('Appointment time is too far in advance based on booking rules');
      }

      const appointment = await createGoogleCalendarAppointment({
        tenantId,
        timezone: clinic.timezone,
        slot: req.body.slot,
        summary: `Dental appointment - ${req.body.patient.fullName}`,
        patient: req.body.patient,
      });

      await upsertPatientProfile({
        tenantId,
        fullName: req.body.patient.fullName,
        phoneNumber: req.body.patient.phoneNumber,
        dateOfBirth: req.body.patient.dateOfBirth ?? null,
        lastVisitAt: new Date(req.body.slot.startIso),
        notes: req.body.patient.reasonForVisit,
      });

      res.json({
        data: appointment,
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
      await cancelGoogleCalendarAppointment({ tenantId, eventId: req.body.eventId });
      res.json({ data: { success: true } });
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
      const clinic = await configService.getClinicProfile(tenantId);
      if (!clinic?.timezone) {
        throw new ValidationError('Clinic timezone is required to reschedule appointments');
      }

      const appointment = await rescheduleGoogleCalendarAppointment({
        tenantId,
        eventId: req.body.eventId,
        slot: req.body.slot,
        timezone: clinic.timezone,
      });

      res.json({ data: appointment });
    } catch (error) {
      next(error);
    }
  },
);
