
import { Router } from 'express';
import * as billingService from './billing.service.js';
import { authenticateJwt, resolveTenant, validate, apiRateLimiter } from '../../middleware/index.js';
import { z } from 'zod';

export const billingRouter = Router();

billingRouter.use(authenticateJwt, resolveTenant);

billingRouter.get(
  '/summary',
  apiRateLimiter,
  validate({
    query: z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const now = new Date();
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : now;

      const summary = await billingService.getTenantBillingSummary({
        tenantId: req.tenantContext!.tenantId,
        startDate,
        endDate,
      });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

billingRouter.get(
  '/trend',
  apiRateLimiter,
  validate({
    query: z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const now = new Date();
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : now;

      const trend = await billingService.getDailyCostTrend({
        tenantId: req.tenantContext!.tenantId,
        startDate,
        endDate,
      });
      res.json({ data: trend });
    } catch (err) {
      next(err);
    }
  },
);

billingRouter.get('/limits', async (req, res, next) => {
  try {
    const result = await billingService.checkPlanLimits(req.tenantContext!.tenantId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
