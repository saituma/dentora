
import { Router, type Request, type Response } from 'express';
import * as authService from './auth.service.js';
import { authenticateJwt, validate } from '../../middleware/index.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AuthenticationError } from '../../lib/errors.js';

export const authRouter = Router();

const OAUTH_EXCHANGE_COOKIE = 'oauth-exchange-code';
const REFRESH_TOKEN_COOKIE = 'refresh-token';

const oauthExchangeCookieOptions = {
  httpOnly: true,
  sameSite: env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/auth/google/exchange',
  maxAge: 2 * 60 * 1000,
};

const clearOauthExchangeCookieOptions = {
  httpOnly: oauthExchangeCookieOptions.httpOnly,
  sameSite: oauthExchangeCookieOptions.sameSite,
  secure: oauthExchangeCookieOptions.secure,
  path: oauthExchangeCookieOptions.path,
};

const refreshTokenCookieOptions = {
  httpOnly: true,
  sameSite: env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
};

const clearRefreshTokenCookieOptions = {
  httpOnly: refreshTokenCookieOptions.httpOnly,
  sameSite: refreshTokenCookieOptions.sameSite,
  secure: refreshTokenCookieOptions.secure,
  path: refreshTokenCookieOptions.path,
};

function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshTokenCookieOptions);
}

function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, clearRefreshTokenCookieOptions);
}

function getRefreshTokenFromRequest(req: Request): string | undefined {
  const cookieToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken) {
    return cookieToken;
  }
  return undefined;
}

function withoutRefreshToken<T extends { refreshToken: string }>(result: T): Omit<T, 'refreshToken'> {
  const { refreshToken: _refreshToken, ...body } = result;
  return body;
}

function sendLoginResult<T extends { refreshToken: string }>(res: Response, status: number, result: T): void {
  setRefreshTokenCookie(res, result.refreshToken);
  res.status(status).json(withoutRefreshToken(result));
}

function getSafeOauthRedirectBase(returnTo?: string | null): string {
  if (!returnTo) return env.CLIENT_URL;

  try {
    const clientUrl = new URL(env.CLIENT_URL);
    const candidate = new URL(returnTo, clientUrl);
    if (candidate.origin !== clientUrl.origin) {
      return env.CLIENT_URL;
    }
    return candidate.origin;
  } catch {
    return env.CLIENT_URL;
  }
}

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
      sendLoginResult(res, 200, result);
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
      const { returnTo, oauthExchangeCode } = await authService.loginOrRegisterWithGoogleCode({ code, state });

      const redirectBase = getSafeOauthRedirectBase(returnTo);
      const redirectUrl = new URL('/login', redirectBase);
      redirectUrl.searchParams.set('oauth', 'google');

      res.cookie(OAUTH_EXCHANGE_COOKIE, oauthExchangeCode, oauthExchangeCookieOptions);
      res.redirect(302, redirectUrl.toString());
    } catch (err: unknown) {
      res.clearCookie(OAUTH_EXCHANGE_COOKIE, clearOauthExchangeCookieOptions);
      const { logger } = await import('../../lib/logger.js');
      logger.error({ err, msg: (err as Error)?.message, stack: (err as Error)?.stack }, 'Google OAuth callback failed');
      next(err);
    }
  },
);

authRouter.post(
  '/google/exchange',
  authRateLimiter,
  async (req, res, next) => {
    try {
      const code = req.cookies?.[OAUTH_EXCHANGE_COOKIE];
      if (typeof code !== 'string' || !code) {
        res.clearCookie(OAUTH_EXCHANGE_COOKIE, clearOauthExchangeCookieOptions);
        throw new AuthenticationError('Missing OAuth exchange cookie');
      }
      const result = await authService.exchangeOauthCode(code);
      setRefreshTokenCookie(res, result.refreshToken);
      res.clearCookie(OAUTH_EXCHANGE_COOKIE, clearOauthExchangeCookieOptions);
      res.json(withoutRefreshToken(result));
    } catch (err) {
      res.clearCookie(OAUTH_EXCHANGE_COOKIE, clearOauthExchangeCookieOptions);
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
      sendLoginResult(res, 200, result);
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
      sendLoginResult(res, 201, result);
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
      sendLoginResult(res, 200, result);
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/refresh',
  validate({
    body: z.object({}).default({}),
  }),
  async (req, res, next) => {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);
      if (!refreshToken) {
        throw new AuthenticationError('Missing refresh token');
      }
      const tokens = await authService.refreshAccessToken(refreshToken);
      setRefreshTokenCookie(res, tokens.refreshToken);
      res.json(withoutRefreshToken(tokens));
    } catch (err) {
      clearRefreshTokenCookie(res);
      next(err);
    }
  },
);

authRouter.post(
  '/logout',
  authenticateJwt,
  validate({
    body: z.object({}).default({}),
  }),
  async (req, res, next) => {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);
      if (!refreshToken) {
        throw new AuthenticationError('Missing refresh token');
      }
      await authService.logout(req.user!.userId, refreshToken);
      clearRefreshTokenCookie(res);
      res.json({ message: 'Logged out' });
    } catch (err) {
      clearRefreshTokenCookie(res);
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

authRouter.post(
  '/set-password',
  authenticateJwt,
  validate({
    body: z.object({
      newPassword: z.string().min(8),
    }),
  }),
  async (req, res, next) => {
    try {
      await authService.setPassword({
        userId: req.user!.userId,
        newPassword: req.body.newPassword,
      });
      res.json({ message: 'Password set' });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.get(
  '/me',
  authenticateJwt,
  async (req, res, next) => {
    try {
      const info = await authService.getUserAccountInfo(req.user!.userId);
      res.json(info);
    } catch (err) {
      next(err);
    }
  },
);
