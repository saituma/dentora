import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { logger } from '../lib/logger.js';

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_SKIP_PREFIXES = ['/api/webhooks', '/api/telephony/webhook', '/api/auth'];

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

  // Skip auth and webhook endpoints
  if (CSRF_SKIP_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  // Skip when the request carries a Bearer token — JWT auth is not vulnerable to CSRF
  // because the token is stored in localStorage, not auto-sent by the browser.
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    logger.warn(
      { method: req.method, path: req.path },
      'CSRF token validation failed',
    );
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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  res.json({ csrfToken: token });
});

/**
 * Cookie parser middleware — required for reading the csrf-token cookie.
 * Re-exported for convenience so the main app can mount it.
 */
export { cookieParser };
