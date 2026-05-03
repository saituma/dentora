
import { Router } from 'express';
import * as adminService from './admin.service.js';
import { authenticateJwt, requirePlatformAdmin, validate } from '../../middleware/index.js';
import { z } from 'zod';
import { runDataRetention } from '../../lib/data-retention.js';

export const adminRouter = Router();

adminRouter.get('/health', async (_req, res, next) => {
  try {
    const health = await adminService.getPlatformHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    next(err);
  }
});

adminRouter.use(authenticateJwt, requirePlatformAdmin);

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const stats = await adminService.getPlatformStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/config/:key', async (req, res, next) => {
  try {
    const value = await adminService.getPlatformConfig(req.params.key as string);
    res.json({ key: req.params.key as string, value });
  } catch (err) {
    next(err);
  }
});

adminRouter.put(
  '/config/:key',
  validate({
    body: z.object({
      value: z.string(),
      description: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      await adminService.setPlatformConfig(req.params.key as string, req.body.value, req.body.description);
      req.audit?.({
        action: 'admin.config_changed',
        entityType: 'platform_config',
        entityId: req.params.key as string,
        afterState: { value: req.body.value },
      });
      res.json({ message: 'Config updated' });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post('/data-retention/run', async (req, res, next) => {
  try {
    const result = await runDataRetention();
    req.audit?.({
      action: 'admin.data_retention_run',
      entityType: 'data_retention',
      afterState: result,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
