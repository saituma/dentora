
import { Router } from 'express';
import * as aiChatService from './ai-chat.service.js';
import { authenticateJwt, resolveTenant, validate } from '../../middleware/index.js';
import { z } from 'zod';

export const aiChatRouter = Router();

aiChatRouter.use(authenticateJwt, resolveTenant);

aiChatRouter.post(
  '/turn',
  validate({
    body: z.object({
      message: z.string().min(1).max(2000),
      conversationHistory: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant', 'system']),
            content: z.string(),
            timestamp: z.string(),
            extractedFields: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .optional()
        .default([]),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await aiChatService.processConfigChatTurn({
        tenantId: req.tenantContext!.tenantId,
        userMessage: req.body.message,
        conversationHistory: req.body.conversationHistory,
      });

      res.json({
        response: result.response,
        extractedFields: result.extractedFields,
        isComplete: result.isComplete,
        readinessScore: result.readinessScore,
        metadata: {
          provider: result.provider,
          latencyMs: result.latencyMs,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
