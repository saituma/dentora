
import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../lib/cache.js';
import { RateLimitError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
  keyExtractor?: (req: Request) => string | null;
}

export function rateLimiter(config: RateLimitConfig) {
  const { maxRequests, windowSeconds, keyPrefix, keyExtractor } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subject = keyExtractor
        ? keyExtractor(req)
        : req.tenantContext?.tenantId || req.ip;

      if (!subject) {
        next();
        return;
      }

      const key = `ratelimit:${keyPrefix}:${subject}`;
      const now = Date.now();
      const windowStart = now - windowSeconds * 1000;

      const redis = getRedis();
      const pipeline = redis.pipeline();

      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
      pipeline.zcard(key);
      pipeline.expire(key, windowSeconds);

      const results = await pipeline.exec();
      if (!results) {
        next();
        return;
      }

      const requestCount = results[2]?.[1] as number;

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - requestCount));
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowSeconds * 1000) / 1000));

      if (requestCount > maxRequests) {
        const retryAfter = windowSeconds;
        res.setHeader('Retry-After', retryAfter);

        logger.warn(
          {
            subject,
            keyPrefix,
            requestCount,
            maxRequests,
            windowSeconds,
          },
          'Rate limit exceeded',
        );

        next(new RateLimitError(retryAfter));
        return;
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Rate limiter Redis error — failing open');
      next();
    }
  };
}

export const apiRateLimiter = rateLimiter({
  maxRequests: 1000,
  windowSeconds: 60,
  keyPrefix: 'api',
});

export const authRateLimiter = rateLimiter({
  maxRequests: 5,
  windowSeconds: 900,
  keyPrefix: 'auth',
  keyExtractor: (req) => req.ip || null,
});

export const webhookRateLimiter = rateLimiter({
  maxRequests: 200,
  windowSeconds: 60,
  keyPrefix: 'webhook',
});

export const configWriteRateLimiter = rateLimiter({
  maxRequests: 30,
  windowSeconds: 60,
  keyPrefix: 'config-write',
});

export const analyticsRateLimiter = rateLimiter({
  maxRequests: 60,
  windowSeconds: 60,
  keyPrefix: 'analytics',
});
