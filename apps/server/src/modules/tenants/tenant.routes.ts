
import { Router } from 'express';
import * as tenantService from './tenant.service.js';
import { authenticateJwt, requirePlatformAdmin, validate } from '../../middleware/index.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import { z } from 'zod';

export const tenantRouter = Router();

tenantRouter.post(
  '/',
  apiRateLimiter,
  validate({
    body: z.object({
      clinicName: z.string().min(2).max(200),
      ownerEmail: z.string().email(),
      ownerPassword: z.string().min(8).max(128),
      plan: z.enum(['starter', 'professional', 'enterprise']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await tenantService.createTenant(req.body);
      req.audit?.({
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: result.tenant.id,
        afterState: { clinicName: req.body.clinicName, plan: req.body.plan },
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

tenantRouter.get(
  '/',
  authenticateJwt,
  requirePlatformAdmin,
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  }),
  async (req, res, next) => {
    try {
      const { limit, offset } = req.query as unknown as { limit: number; offset: number };
      const tenants = await tenantService.listTenants({ limit, offset });
      res.json({ data: tenants });
    } catch (err) {
      next(err);
    }
  },
);

tenantRouter.get(
  '/:tenantId',
  authenticateJwt,
  async (req, res, next) => {
    try {
      const tenant = await tenantService.getTenantById(req.params.tenantId as string);
      res.json(tenant);
    } catch (err) {
      next(err);
    }
  },
);

tenantRouter.patch(
  '/:tenantId/status',
  authenticateJwt,
  requirePlatformAdmin,
  validate({
    body: z.object({
      status: z.enum(['active', 'suspended', 'archived']),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenant = await tenantService.updateTenantStatus(
        req.params.tenantId as string,
        req.body.status,
      );
      req.audit?.({
        action: 'tenant.status_changed',
        entityType: 'tenant',
        entityId: req.params.tenantId as string,
        afterState: { status: req.body.status },
      });
      res.json(tenant);
    } catch (err) {
      next(err);
    }
  },
);

tenantRouter.get(
  '/:tenantId/config',
  authenticateJwt,
  async (req, res, next) => {
    try {
      const config = await tenantService.getTenantConfig(req.params.tenantId as string);
      res.json(config ?? { message: 'No active configuration' });
    } catch (err) {
      next(err);
    }
  },
);
