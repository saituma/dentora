import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate, rateLimiter } from '../../middleware/index.js';
import {
  findPatientProfile,
  listPatientProfiles,
  upsertPatientProfile,
  getPatientProfileById,
} from './patients.service.js';
import { listCallSessionsByCaller } from '../calls/call.service.js';
import { deletePatientAndAllData } from './patient.deletion.js';
import { exportPatientData } from './patient.export.js';

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
      req.audit?.({ action: 'patient.list', entityType: 'patient_profile' });
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

      req.audit?.({
        action: 'patient.lookup',
        entityType: 'patient_profile',
        entityId: profile?.id,
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

      req.audit?.({
        action: 'patient.upsert',
        entityType: 'patient_profile',
        entityId: profile.id,
      });
      res.json({ data: profile });
    } catch (error) {
      next(error);
    }
  },
);

patientsRouter.get(
  '/:patientId',
  authenticateJwt,
  resolveTenant,
  patientsRateLimiter,
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const profile = await getPatientProfileById({
        tenantId,
        patientId: String(req.params.patientId),
      });

      if (!profile) {
        res.status(404).json({ error: 'Patient not found' });
        return;
      }

      req.audit?.({ action: 'patient.read', entityType: 'patient_profile', entityId: profile.id });
      res.json({ data: profile });
    } catch (error) {
      next(error);
    }
  },
);

patientsRouter.get(
  '/:patientId/calls',
  authenticateJwt,
  resolveTenant,
  patientsRateLimiter,
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const profile = await getPatientProfileById({
        tenantId,
        patientId: String(req.params.patientId),
      });

      if (!profile) {
        res.status(404).json({ error: 'Patient not found' });
        return;
      }

      const calls = await listCallSessionsByCaller({
        tenantId,
        phoneNumber: profile.phoneNumber,
        limit: (req.query as unknown as { limit?: number }).limit,
      });

      res.json({ data: calls });
    } catch (error) {
      next(error);
    }
  },
);

patientsRouter.get(
  '/:patientId/export',
  authenticateJwt,
  resolveTenant,
  patientsRateLimiter,
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const data = await exportPatientData({
        tenantId,
        patientId: String(req.params.patientId),
      });

      req.audit?.({
        action: 'patient.export',
        entityType: 'patient_profile',
        entityId: String(req.params.patientId),
      });

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="patient-export-${req.params.patientId}.json"`,
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
);

patientsRouter.delete(
  '/:patientId',
  authenticateJwt,
  resolveTenant,
  patientsRateLimiter,
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const result = await deletePatientAndAllData({
        tenantId,
        patientId: String(req.params.patientId),
      });

      req.audit?.({
        action: 'patient.delete',
        entityType: 'patient_profile',
        entityId: String(req.params.patientId),
      });

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);
