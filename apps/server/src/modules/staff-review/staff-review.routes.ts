import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate, rateLimiter } from '../../middleware/index.js';
import {
  assignStaffReviewItem,
  getDailyStaffReviewDigest,
  getStaffReviewItem,
  listHighCriticalOpenItemsNeedingNotification,
  listStaffReviewItems,
  toSafeStaffReviewItemResponse,
  updateStaffReviewItemStatus,
} from './staff-review.service.js';

const staffReviewRateLimiter = rateLimiter({
  maxRequests: 120,
  windowSeconds: 60,
  keyPrefix: 'staff-review',
});

const staffReviewStatuses = ['open', 'in_review', 'resolved', 'ignored'] as const;
const staffReviewSeverities = ['low', 'medium', 'high', 'critical'] as const;
const staffReviewTypes = [
  'booking_failure',
  'reconciliation_failed',
  'reconciliation_retry_scheduled',
  'cancellation_requested',
  'reschedule_requested',
  'readiness_failure',
  'legacy_calendar_phi_detected',
  'media_stream_failure',
  'ai_tool_safety_block',
] as const;
const staffReviewSources = [
  'ai_tool',
  'appointment_reconciliation',
  'onboarding_readiness',
  'calendar_phi_scanner',
  'media_stream',
  'system',
] as const;

const statusSchema = z.enum(staffReviewStatuses);
const severitySchema = z.enum(staffReviewSeverities);
const typeSchema = z.enum(staffReviewTypes);
const sourceSchema = z.enum(staffReviewSources);

export const staffReviewRouter = Router();

staffReviewRouter.use(authenticateJwt, resolveTenant, staffReviewRateLimiter);

staffReviewRouter.get(
  '/alerts/due',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const query = req.query as unknown as { limit?: number };
      const now = new Date();
      const items = await listHighCriticalOpenItemsNeedingNotification({
        tenantId,
        limit: query.limit,
        now,
      });
      req.audit?.({ action: 'staff_review.alerts_due', entityType: 'staff_review_item' });
      res.json({
        data: items.map((item) => toSafeStaffReviewItemResponse(item, now)),
        summary: {
          count: items.length,
          overdueCount: items.filter((item) => toSafeStaffReviewItemResponse(item, now).overdue)
            .length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

staffReviewRouter.get(
  '/digest/daily',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const query = req.query as unknown as { limit?: number };
      const digest = await getDailyStaffReviewDigest({ tenantId, limit: query.limit });
      req.audit?.({ action: 'staff_review.daily_digest', entityType: 'staff_review_item' });
      res.json({ data: digest });
    } catch (error) {
      next(error);
    }
  },
);

staffReviewRouter.get(
  '/items',
  validate({
    query: z.object({
      status: statusSchema.optional(),
      severity: severitySchema.optional(),
      type: typeSchema.optional(),
      source: sourceSchema.optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const query = req.query as unknown as {
        status?: (typeof staffReviewStatuses)[number];
        severity?: (typeof staffReviewSeverities)[number];
        type?: (typeof staffReviewTypes)[number];
        source?: (typeof staffReviewSources)[number];
        limit?: number;
      };
      const now = new Date();
      const items = await listStaffReviewItems({
        tenantId,
        status: query.status,
        severity: query.severity,
        type: query.type,
        source: query.source,
        limit: query.limit,
      });
      req.audit?.({ action: 'staff_review.list', entityType: 'staff_review_item' });
      const data = items.map((item) => toSafeStaffReviewItemResponse(item, now));
      res.json({
        data,
        summary: {
          count: data.length,
          overdueCount: data.filter((item) => item.overdue).length,
          highCriticalOpenCount: data.filter(
            (item) =>
              item.status === 'open' && (item.severity === 'high' || item.severity === 'critical'),
          ).length,
        },
      });
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
    res.json({ data: toSafeStaffReviewItemResponse(item) });
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
      res.json({ data: toSafeStaffReviewItemResponse(item) });
    } catch (error) {
      next(error);
    }
  },
);

staffReviewRouter.patch(
  '/items/:id/assignment',
  validate({
    body: z.object({
      assignedToUserId: z.string().uuid().nullable(),
    }),
  }),
  async (req, res, next) => {
    try {
      const itemId = String(req.params.id);
      const item = await assignStaffReviewItem({
        tenantId: req.tenantContext!.tenantId,
        id: itemId,
        assignedToUserId: req.body.assignedToUserId,
      });
      req.audit?.({
        action: 'staff_review.assign',
        entityType: 'staff_review_item',
        entityId: itemId,
      });
      res.json({ data: toSafeStaffReviewItemResponse(item) });
    } catch (error) {
      next(error);
    }
  },
);
