import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_SKIP_PREFIXES = ['/api/webhooks', '/api/telephony/webhook', '/api/admin/seed'];
const CSRF_PUBLIC_AUTH_POST_PATHS = new Set([
  '/api/auth/email/send-otp',
  '/api/auth/email/verify-otp',
  '/api/auth/phone/send-otp',
  '/api/auth/phone/verify-otp',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
]);
// Cookie-backed endpoints: token/session is set via httpOnly cookie so the
// browser auto-sends it on cross-origin requests → CSRF protection required.
const CSRF_REQUIRED_AUTH_POST_PATHS = new Set([
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/google/exchange',
]);

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Double-submit cookie CSRF protection middleware.
 *
 * - Safe methods (GET/HEAD/OPTIONS) are always allowed through.
 * - Webhook paths are skipped (they use their own signature verification).
 * - For all other requests, the `x-csrf-token` header must match the `csrf-token` cookie.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip safe methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip webhook endpoints
  if (CSRF_SKIP_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  // Keep public auth entrypoints usable without CSRF. Cookie-backed auth endpoints
  // such as refresh, logout, and Google exchange must pass the double-submit check.
  if (req.method === 'POST' && CSRF_PUBLIC_AUTH_POST_PATHS.has(req.path)) {
    return next();
  }

  const requiresAuthCookieCsrf =
    req.method === 'POST' && CSRF_REQUIRED_AUTH_POST_PATHS.has(req.path);

  // Skip when the request carries a Bearer token — JWT auth is not vulnerable to CSRF
  // because the token is stored in localStorage, not auto-sent by the browser.
  // Cookie-backed auth endpoints still require CSRF even when an access token is present.
  const authHeader = req.headers.authorization;
  if (!requiresAuthCookieCsrf && authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    logger.warn({ method: req.method, path: req.path }, 'CSRF token validation failed');
    res.status(403).json({ error: 'CSRF token validation failed' });
    return;
  }

  next();
}

/**
 * Router that provides a GET /api/csrf-token endpoint.
 * Sets the csrf-token cookie and returns the token in the response body.
 */
export const csrfTokenRouter = Router();

csrfTokenRouter.get('/api/csrf-token', (_req: Request, res: Response) => {
  const token = generateToken();

  res.cookie(CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: env.COOKIE_SAMESITE,
    secure: env.COOKIE_SECURE,
    path: '/',
  });

  res.json({ csrfToken: token });
});

/**
 * Cookie parser middleware — required for reading the csrf-token cookie.
 * Re-exported for convenience so the main app can mount it.
 */
export { cookieParser };
