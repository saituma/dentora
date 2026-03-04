
import { Router } from 'express';
import * as authService from './auth.service.js';
import { authenticateJwt, validate } from '../../middleware/index.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { z } from 'zod';

export const authRouter = Router();

authRouter.post(
  '/login',
  authRateLimiter,
  validate({
    body: z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await authService.login(req.body.email, req.body.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/refresh',
  validate({
    body: z.object({
      refreshToken: z.string().min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      const tokens = await authService.refreshAccessToken(req.body.refreshToken);
      res.json(tokens);
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/logout',
  authenticateJwt,
  validate({
    body: z.object({
      refreshToken: z.string().min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      await authService.logout(req.user!.userId, req.body.refreshToken);
      res.json({ message: 'Logged out' });
    } catch (err) {
      next(err);
    }
  },
);
