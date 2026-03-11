import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate, rateLimiter } from '../../middleware/index.js';
import { findPatientProfile, listPatientProfiles, upsertPatientProfile } from './patients.service.js';

const patientsRateLimiter = rateLimiter({
  maxRequests: 120,
  windowSeconds: 60,
  keyPrefix: 'patients',
});

const lookupSchema = z.object({
  phoneNumber: z.string().min(7),
  dateOfBirth: z.string().min(4),
});

const upsertSchema = z.object({
  fullName: z.string().min(2),
  phoneNumber: z.string().min(7),
  dateOfBirth: z.string().min(4).optional().nullable(),
  lastVisitAt: z.string().min(4).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const patientsRouter = Router();

patientsRouter.get(
  '/',
  authenticateJwt,
  resolveTenant,
  patientsRateLimiter,
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      const profiles = await listPatientProfiles({ tenantId, search, limit });
      res.json({ data: profiles });
    } catch (error) {
      next(error);
    }
  },
);

patientsRouter.post(
  '/lookup',
  authenticateJwt,
  resolveTenant,
  patientsRateLimiter,
  validate({ body: lookupSchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const profile = await findPatientProfile({
        tenantId,
        phoneNumber: req.body.phoneNumber,
        dateOfBirth: req.body.dateOfBirth,
      });

      res.json({ data: profile });
    } catch (error) {
      next(error);
    }
  },
);

patientsRouter.post(
  '/upsert',
  authenticateJwt,
  resolveTenant,
  patientsRateLimiter,
  validate({ body: upsertSchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const profile = await upsertPatientProfile({
        tenantId,
        fullName: req.body.fullName,
        phoneNumber: req.body.phoneNumber,
        dateOfBirth: req.body.dateOfBirth ?? null,
        lastVisitAt: req.body.lastVisitAt ? new Date(req.body.lastVisitAt) : null,
        notes: req.body.notes ?? null,
      });

      res.json({ data: profile });
    } catch (error) {
      next(error);
    }
  },
);
