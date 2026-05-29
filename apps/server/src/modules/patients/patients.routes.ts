import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { authenticateJwt, resolveTenant, validate, rateLimiter } from '../../middleware/index.js';
import {
  findPatientProfile,
  listPatientProfiles,
  upsertPatientProfile,
  getPatientProfileById,
  bulkImportPatients,
  setPatientMessagingConsent,
} from './patients.service.js';
import { listCallSessionsByCaller } from '../calls/call.service.js';
import { deletePatientAndAllData } from './patient.deletion.js';
import { exportPatientData } from './patient.export.js';
import { ValidationError } from '../../lib/errors.js';

const patientsRateLimiter = rateLimiter({
  maxRequests: 120,
  windowSeconds: 60,
  keyPrefix: 'patients',
});

const importRateLimiter = rateLimiter({
  maxRequests: 10,
  windowSeconds: 60,
  keyPrefix: 'patients-import',
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (
      ext === 'csv' ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      cb(null, true);
    } else {
      cb(new ValidationError('Only CSV files are allowed'));
    }
  },
});

const lookupSchema = z.object({
  phoneNumber: z.string().min(7),
  dateOfBirth: z.string().min(4),
});

const consentSchema = z.object({
  consent: z.boolean(),
  preferredChannel: z.enum(['sms', 'whatsapp', 'both', 'none']).optional(),
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

patientsRouter.post(
  '/import',
  authenticateJwt,
  resolveTenant,
  importRateLimiter,
  csvUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ValidationError('No file uploaded');

      const tenantId = req.tenantContext!.tenantId;
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer', raw: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new ValidationError('CSV file is empty');

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

      if (rows.length === 0) throw new ValidationError('CSV contains no data rows');
      if (rows.length > 5000)
        throw new ValidationError('CSV must not exceed 5,000 rows per import');

      const result = await bulkImportPatients({ tenantId, rows });

      req.audit?.({
        action: 'patient.import',
        entityType: 'patient_profile',
      });

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

patientsRouter.post(
  '/:patientId/consent',
  authenticateJwt,
  resolveTenant,
  patientsRateLimiter,
  validate({ body: consentSchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const profile = await setPatientMessagingConsent({
        tenantId,
        patientId: String(req.params.patientId),
        consent: req.body.consent,
        preferredChannel: req.body.preferredChannel,
      });

      if (!profile) {
        res.status(404).json({ error: 'Patient not found' });
        return;
      }

      req.audit?.({
        action: req.body.consent ? 'patient.consent.grant' : 'patient.consent.withdraw',
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
