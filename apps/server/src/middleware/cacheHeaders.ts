import { createHash } from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Adds ETag + conditional GET (304 Not Modified) to JSON responses.
 * Intercepts res.json(), computes an MD5 ETag, and short-circuits with 304
 * if the client sent a matching If-None-Match header.
 *
 * Usage: apply to individual routes or router-level for cacheable GET endpoints.
 */
export function etag(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown): Response {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const payload = JSON.stringify(body);
        const hash = createHash('md5').update(payload).digest('hex');
        const etagValue = `"${hash}"`;

        res.setHeader('ETag', etagValue);

        const ifNoneMatch = _req.headers['if-none-match'];
        if (ifNoneMatch === etagValue) {
          res.status(304).end();
          return res;
        }
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Sets Cache-Control headers for responses that are safe to cache by the
 * browser and CDN. Use for rarely-changing config/reference data endpoints.
 *
 * @param maxAgeSeconds  Browser cache TTL (default: 60s)
 * @param sMaxAgeSeconds CDN/shared cache TTL (default: same as maxAge)
 */
export function cacheControl(maxAgeSeconds = 60, sMaxAgeSeconds?: number): RequestHandler {
  const sMax = sMaxAgeSeconds ?? maxAgeSeconds;
  const headerValue = `public, max-age=${maxAgeSeconds}, s-maxage=${sMax}, stale-while-revalidate=${maxAgeSeconds * 2}`;

  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', headerValue);
    next();
  };
}

/**
 * Disables caching entirely — use on private, user-specific, or mutable endpoints.
 */
export function noCache(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  };
}
