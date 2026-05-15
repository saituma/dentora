import { Router } from 'express';
import multer from 'multer';
import { authenticateJwt, resolveTenant } from '../../middleware/index.js';
import {
  uploadFile,
  downloadFile,
  buildStorageKey,
  isStorageConfigured,
} from '../../lib/storage.js';
import { db } from '../../db/index.js';
import { users, clinicProfile } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export const uploadsRouter = Router();

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  },
});

uploadsRouter.post(
  '/clinic-logo',
  authenticateJwt,
  resolveTenant,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ValidationError('No file uploaded');
      if (!isStorageConfigured()) throw new ValidationError('File storage is not configured');

      const tenantId = req.tenantContext!.tenantId;
      const ext = req.file.mimetype.split('/')[1] ?? 'jpg';
      const key = buildStorageKey(tenantId, 'logos', `clinic-logo.${ext}`);

      await uploadFile({ key, body: req.file.buffer, contentType: req.file.mimetype });

      await db
        .update(clinicProfile)
        .set({ logo: key, updatedAt: new Date() })
        .where(eq(clinicProfile.tenantId, tenantId));

      logger.info({ tenantId, key }, 'Clinic logo uploaded');
      res.json({ data: { key } });
    } catch (err) {
      next(err);
    }
  },
);

uploadsRouter.post(
  '/user-avatar',
  authenticateJwt,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ValidationError('No file uploaded');
      if (!isStorageConfigured()) throw new ValidationError('File storage is not configured');

      const userId = req.user!.userId;
      const ext = req.file.mimetype.split('/')[1] ?? 'jpg';
      const key = buildStorageKey(userId, 'avatars', `avatar.${ext}`);

      await uploadFile({ key, body: req.file.buffer, contentType: req.file.mimetype });

      await db
        .update(users)
        .set({ avatarUrl: key, updatedAt: new Date() })
        .where(eq(users.id, userId));

      logger.info({ userId, key }, 'User avatar uploaded');
      res.json({ data: { key } });
    } catch (err) {
      next(err);
    }
  },
);

// Serve images — authenticated, 1h browser cache
uploadsRouter.get('/image', authenticateJwt, resolveTenant, async (req, res, next) => {
  try {
    const key = typeof req.query.key === 'string' ? req.query.key : null;
    if (!key) throw new ValidationError('key query param required');

    const tenantId = req.tenantContext!.tenantId;
    const userId = req.user!.userId;

    // Authorise: key must belong to this tenant or this user
    const isOwnedByTenant = key.startsWith(`tenants/${tenantId}/`);
    const isOwnedByUser = key.startsWith(`tenants/${userId}/`) || key.includes(`/${userId}/`);
    if (!isOwnedByTenant && !isOwnedByUser) {
      // Also allow user-level avatar keys
      const [userRow] = await db
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (userRow?.avatarUrl !== key) {
        return next(new ValidationError('Forbidden'));
      }
    }

    const { body, contentType } = await downloadFile(key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(body);
  } catch (err) {
    next(err);
  }
});

// Public clinic logo (no auth — needed for sidebar before login resolves)
uploadsRouter.get('/clinic-logo', authenticateJwt, resolveTenant, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const [row] = await db
      .select({ logo: clinicProfile.logo })
      .from(clinicProfile)
      .where(and(eq(clinicProfile.tenantId, tenantId)))
      .limit(1);

    if (!row?.logo) {
      res.status(404).json({ error: 'No logo set' });
      return;
    }

    const { body, contentType } = await downloadFile(row.logo);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(body);
  } catch (err) {
    next(err);
  }
});
