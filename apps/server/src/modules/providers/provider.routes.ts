
import { Router } from 'express';
import * as providerService from './provider.service.js';
import { authenticateJwt, requirePlatformAdmin, validate, apiRateLimiter } from '../../middleware/index.js';
import { z } from 'zod';

export const providerRouter = Router();

providerRouter.use(authenticateJwt, requirePlatformAdmin);

providerRouter.post(
  '/',
  apiRateLimiter,
  validate({
    body: z.object({
      name: z.string().min(1).max(100),
      providerType: z.enum(['llm', 'stt', 'tts']),
      apiEndpoint: z.string().url(),
      models: z.array(z.string()).min(1),
      isActive: z.boolean().optional(),
      priorityOrder: z.number().int().min(0).optional(),
      capabilities: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const provider = await providerService.registerProvider(req.body);
      req.audit?.({
        action: 'provider.registered',
        entityType: 'provider',
        entityId: provider.id,
        afterState: { name: req.body.name, type: req.body.providerType },
      });
      res.status(201).json(provider);
    } catch (err) {
      next(err);
    }
  },
);

providerRouter.get('/', async (_req, res, next) => {
  try {
    const providers = await providerService.listProviders();
    res.json({ data: providers });
  } catch (err) {
    next(err);
  }
});

providerRouter.get('/:providerId/health', async (req, res, next) => {
  try {
    const health = await providerService.getProviderHealth(req.params.providerId);
    res.json(health ?? { message: 'No health data available' });
  } catch (err) {
    next(err);
  }
});

providerRouter.post(
  '/:providerId/pricing',
  validate({
    body: z.object({
      model: z.string().min(1),
      inputCostPer1k: z.string(),
      outputCostPer1k: z.string(),
      currency: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      await providerService.setProviderPricing({
        providerId: req.params.providerId,
        ...req.body,
      });
      res.status(201).json({ message: 'Pricing set' });
    } catch (err) {
      next(err);
    }
  },
);

providerRouter.post('/:providerId/deactivate', async (req, res, next) => {
  try {
    await providerService.deactivateProvider(req.params.providerId);
    req.audit?.({
      action: 'provider.deactivated',
      entityType: 'provider',
      entityId: req.params.providerId,
    });
    res.json({ message: 'Provider deactivated' });
  } catch (err) {
    next(err);
  }
});
