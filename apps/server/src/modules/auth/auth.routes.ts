
import { Router } from 'express';
import * as authService from './auth.service.js';
import { authenticateJwt, validate } from '../../middleware/index.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { z } from 'zod';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimiter,
  validate({
    body: z.object({
      email: z.string().email(),
      password: z.string().min(8),
      clinicName: z.string().min(1).max(200),
      displayName: z.string().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

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

authRouter.post(
  '/change-password',
  authenticateJwt,
  validate({
    body: z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }),
  }),
  async (req, res, next) => {
    try {
      await authService.changePassword({
        userId: req.user!.userId,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
      });
      res.json({ message: 'Password updated' });
    } catch (err) {
      next(err);
    }
  },
);
