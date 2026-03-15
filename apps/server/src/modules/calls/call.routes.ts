
import { Router } from 'express';
import * as callService from './call.service.js';
import { authenticateJwt, validate, resolveTenant, apiRateLimiter } from '../../middleware/index.js';
import { z } from 'zod';

export const callRouter = Router();

callRouter.use(authenticateJwt, resolveTenant);

callRouter.get(
  '/',
  apiRateLimiter,
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const { limit, offset } = req.query as any;
      const calls = await callService.listCallSessions({ tenantId, limit, offset });
      res.json({ data: calls });
    } catch (err) {
      next(err);
    }
  },
);

callRouter.get('/:callId', async (req, res, next) => {
  try {
    const session = await callService.getCallSession(
      req.tenantContext!.tenantId,
      req.params.callId,
    );
    res.json(session);
  } catch (err) {
    next(err);
  }
});

callRouter.get('/:callId/events', async (req, res, next) => {
  try {
    const events = await callService.getCallEvents(
      req.tenantContext!.tenantId,
      req.params.callId,
    );
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

callRouter.get('/:callId/transcript', async (req, res, next) => {
  try {
    const transcript = await callService.getCallTranscript(
      req.tenantContext!.tenantId,
      req.params.callId,
    );
    res.json({ data: transcript });
  } catch (err) {
    next(err);
  }
});

callRouter.get('/:callId/costs', async (req, res, next) => {
  try {
    const costs = await callService.getCallCostBreakdown(
      req.tenantContext!.tenantId,
      req.params.callId,
    );
    res.json({ data: costs });
  } catch (err) {
    next(err);
  }
});
