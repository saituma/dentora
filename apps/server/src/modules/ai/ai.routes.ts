
import { Router } from 'express';
import * as aiService from './ai.service.js';
import { authenticateJwt, resolveTenant, validate, apiRateLimiter } from '../../middleware/index.js';
import { z } from 'zod';

export const aiRouter = Router();

aiRouter.use(authenticateJwt, resolveTenant);

aiRouter.post(
  '/test-prompt',
  apiRateLimiter,
  validate({
    body: z.object({
      configVersion: z.coerce.number().int().positive(),
      testMessage: z.string().min(1).max(1000),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const context = await aiService.loadTenantAIContext(tenantId, req.body.configVersion);
      const systemPrompt = aiService.buildSystemPrompt(context);

      const result = await aiService.processConversationTurn({
        tenantId,
        callSessionId: 'test-session',
        systemPrompt,
        conversationHistory: [],
        userMessage: req.body.testMessage,
      });

      res.json({
        systemPrompt,
        response: result.response,
        provider: result.provider,
        latencyMs: result.latencyMs,
      });
    } catch (err) {
      next(err);
    }
  },
);

aiRouter.get('/context', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const configVersion = req.tenantContext!.activeConfigVersion;
    if (!configVersion) {
      res.json({ message: 'No active configuration version' });
      return;
    }
    const context = await aiService.loadTenantAIContext(tenantId, configVersion);
    res.json(context);
  } catch (err) {
    next(err);
  }
});
