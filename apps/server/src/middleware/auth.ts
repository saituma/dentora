
import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/crypto.js';
import { AuthenticationError, AuthorizationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    req.user = payload;

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      next(error);
      return;
    }
    logger.warn({ err: error }, 'JWT verification failed');
    next(new AuthenticationError('Invalid or expired token'));
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        { userId: req.user.userId, role: req.user.role, required: allowedRoles },
        'Insufficient role for route',
      );
      next(new AuthorizationError(`Role '${req.user.role}' does not have access to this resource`));
      return;
    }

    next();
  };
}

export const requirePlatformAdmin = requireRole('platform_admin');
