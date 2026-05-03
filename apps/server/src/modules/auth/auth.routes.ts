
import { Router } from 'express';
import * as authService from './auth.service.js';
import { authenticateJwt, validate } from '../../middleware/index.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { z } from 'zod';
import { env } from '../../config/env.js';

export const authRouter = Router();

authRouter.post(
  '/email/send-otp',
  authRateLimiter,
  validate({
    body: z.object({
      email: z.string().email(),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await authService.sendEmailOtp({ email: req.body.email });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/email/verify-otp',
  authRateLimiter,
  validate({
    body: z.object({
      email: z.string().email(),
      code: z.string().length(6),
      clinicName: z.string().min(1).max(200).optional(),
      displayName: z.string().min(1).max(200).optional(),
      password: z.string().min(8).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await authService.verifyEmailOtpAndRegister(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

authRouter.get(
  '/google/start',
  validate({
    query: z.object({
      returnTo: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const authUrl = authService.createGoogleOauthStartUrl({
        returnTo: (req.query as { returnTo?: string }).returnTo,
      });
      res.json({ authUrl });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.get(
  '/google/callback',
  validate({
    query: z.object({
      code: z.string().min(1),
      state: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { code, state } = req.query as { code: string; state?: string };
      const { loginResult, returnTo } = await authService.loginOrRegisterWithGoogleCode({ code, state });

      const redirectBase = returnTo && /^https?:\/\//i.test(returnTo)
        ? returnTo
        : env.CLIENT_URL;
      const redirectUrl = new URL('/login', redirectBase);
      redirectUrl.searchParams.set('oauth', 'google');
      redirectUrl.searchParams.set('accessToken', loginResult.accessToken);
      redirectUrl.searchParams.set('refreshToken', loginResult.refreshToken);
      redirectUrl.searchParams.set('tenantId', loginResult.tenantId ?? '');
      redirectUrl.searchParams.set('userId', loginResult.user.id);
      redirectUrl.searchParams.set('email', loginResult.user.email);
      redirectUrl.searchParams.set('displayName', loginResult.user.displayName ?? '');
      redirectUrl.searchParams.set('role', loginResult.user.role);

      res.redirect(302, redirectUrl.toString());
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/phone/send-otp',
  authRateLimiter,
  validate({
    body: z.object({
      phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await authService.sendPhoneOtp(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/phone/verify-otp',
  authRateLimiter,
  validate({
    body: z.object({
      phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/),
      code: z.string().length(6),
      clinicName: z.string().min(1).max(200),
      displayName: z.string().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await authService.verifyPhoneOtpAndRegister(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

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
  '/forgot-password',
  authRateLimiter,
  validate({
    body: z.object({
      email: z.string().email(),
    }),
  }),
  async (req, res, next) => {
    try {
      await authService.requestPasswordReset({ email: req.body.email });
      res.json({ message: 'If that email exists, a reset link has been sent' });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/reset-password',
  authRateLimiter,
  validate({
    body: z.object({
      token: z.string().min(1),
      newPassword: z.string().min(8),
    }),
  }),
  async (req, res, next) => {
    try {
      await authService.resetPassword({
        token: req.body.token,
        newPassword: req.body.newPassword,
      });
      res.json({ message: 'Password has been reset' });
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
