
import { Router } from 'express';
import * as analyticsService from './analytics.service.js';
import { authenticateJwt, resolveTenant, requirePlatformAdmin, validate } from '../../middleware/index.js';
import { analyticsRateLimiter } from '../../middleware/rateLimit.js';
import { z } from 'zod';

export const analyticsRouter = Router();

analyticsRouter.get(
  '/dashboard',
  authenticateJwt,
  resolveTenant,
  analyticsRateLimiter,
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
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : now;

      const stats = await analyticsService.getDashboardStats({
        tenantId: req.tenantContext!.tenantId,
        startDate,
        endDate,
      });
      res.json(stats);
    } catch (err) {
      next(err);
    }
  },
);

analyticsRouter.get(
  '/hourly',
  authenticateJwt,
  resolveTenant,
  analyticsRateLimiter,
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
        : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : now;

      const data = await analyticsService.getHourlyCallVolume({
        tenantId: req.tenantContext!.tenantId,
        startDate,
        endDate,
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

analyticsRouter.get(
  '/providers',
  authenticateJwt,
  requirePlatformAdmin,
  analyticsRateLimiter,
  async (req, res, next) => {
    try {
      const now = new Date();
      const data = await analyticsService.getProviderPerformance({
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endDate: now,
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);
