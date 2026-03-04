
import { Router } from 'express';
import * as integrationService from './integration.service.js';
import { authenticateJwt, resolveTenant, validate, apiRateLimiter } from '../../middleware/index.js';
import { z } from 'zod';

export const integrationRouter = Router();

integrationRouter.use(authenticateJwt, resolveTenant);

integrationRouter.post(
  '/',
  apiRateLimiter,
  validate({
    body: z.object({
      integrationType: z.enum(['pms', 'calendar', 'crm', 'messaging']),
      provider: z.string().min(1).optional(),
      config: z.record(z.string(), z.unknown()),
      credentials: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const integration = await integrationService.upsertIntegration({
        tenantId: req.tenantContext!.tenantId,
        ...req.body,
      });
      req.audit?.({
        action: 'integration.upserted',
        entityType: 'integration',
        entityId: integration.id,
        afterState: { type: req.body.integrationType },
      });
      res.status(201).json(integration);
    } catch (err) {
      next(err);
    }
  },
);

integrationRouter.get('/', async (req, res, next) => {
  try {
    const items = await integrationService.getIntegrations(req.tenantContext!.tenantId);
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

integrationRouter.post('/:id/activate', async (req, res, next) => {
  try {
    const integration = await integrationService.activateIntegration(
      req.tenantContext!.tenantId,
      req.params.id,
    );
    res.json(integration);
  } catch (err) {
    next(err);
  }
});

integrationRouter.post('/:id/test', async (req, res, next) => {
  try {
    const result = await integrationService.testIntegration(
      req.tenantContext!.tenantId,
      req.params.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

integrationRouter.delete('/:id', async (req, res, next) => {
  try {
    await integrationService.deleteIntegration(req.tenantContext!.tenantId, req.params.id);
    req.audit?.({
      action: 'integration.deleted',
      entityType: 'integration',
      entityId: req.params.id,
    });
    res.json({ message: 'Integration deleted' });
  } catch (err) {
    next(err);
  }
});
