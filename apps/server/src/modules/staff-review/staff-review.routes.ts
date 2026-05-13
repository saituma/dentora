import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate, rateLimiter } from '../../middleware/index.js';
import {
  getStaffReviewItem,
  listStaffReviewItems,
  updateStaffReviewItemStatus,
} from './staff-review.service.js';

const staffReviewRateLimiter = rateLimiter({
  maxRequests: 120,
  windowSeconds: 60,
  keyPrefix: 'staff-review',
});

const statusSchema = z.enum(['open', 'in_review', 'resolved', 'ignored']);

export const staffReviewRouter = Router();

staffReviewRouter.use(authenticateJwt, resolveTenant, staffReviewRateLimiter);

staffReviewRouter.get(
  '/items',
  validate({
    query: z.object({
      status: statusSchema.optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const query = req.query as unknown as {
        status?: 'open' | 'in_review' | 'resolved' | 'ignored';
        limit?: number;
      };
      const items = await listStaffReviewItems({
        tenantId,
        status: query.status,
        limit: query.limit,
      });
      req.audit?.({ action: 'staff_review.list', entityType: 'staff_review_item' });
      res.json({ data: items });
    } catch (error) {
      next(error);
    }
  },
);

staffReviewRouter.get('/items/:id', async (req, res, next) => {
  try {
    const itemId = String(req.params.id);
    const item = await getStaffReviewItem({
      tenantId: req.tenantContext!.tenantId,
      id: itemId,
    });
    req.audit?.({
      action: 'staff_review.read',
      entityType: 'staff_review_item',
      entityId: itemId,
    });
    res.json({ data: item });
  } catch (error) {
    next(error);
  }
});

staffReviewRouter.patch(
  '/items/:id/status',
  validate({
    body: z.object({
      status: statusSchema,
      resolutionNote: z.string().optional().nullable(),
    }),
  }),
  async (req, res, next) => {
    try {
      const itemId = String(req.params.id);
      const userId = typeof req.user?.userId === 'string' ? req.user.userId : null;
      const item = await updateStaffReviewItemStatus({
        tenantId: req.tenantContext!.tenantId,
        id: itemId,
        status: req.body.status,
        resolvedByUserId: userId,
        resolutionNote: req.body.resolutionNote ?? null,
      });
      req.audit?.({
        action: 'staff_review.status_update',
        entityType: 'staff_review_item',
        entityId: itemId,
      });
      res.json({ data: item });
    } catch (error) {
      next(error);
    }
  },
);
