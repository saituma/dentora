import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, rateLimiter, validate } from '../../middleware/index.js';
import { listReminders } from './reminder.service.js';

const remindersRateLimiter = rateLimiter({
  maxRequests: 120,
  windowSeconds: 60,
  keyPrefix: 'reminders',
});

export const remindersRouter = Router();

remindersRouter.get(
  '/',
  authenticateJwt,
  resolveTenant,
  remindersRateLimiter,
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const data = await listReminders({
        tenantId,
        limit: (req.query as unknown as { limit?: number }).limit,
      });
      req.audit?.({ action: 'reminder.list', entityType: 'appointment_reminder' });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
