
import type { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestsTotal } from '../lib/metrics.js';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/metrics') {
    next();
    return;
  }

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSeconds = durationNs / 1e9;

    const route = normalizeRoute(req.route?.path || req.path);

    httpRequestDuration
      .labels(req.method, route, String(res.statusCode))
      .observe(durationSeconds);

    httpRequestsTotal
      .labels(req.method, route, String(res.statusCode))
      .inc();
  });

  next();
}

function normalizeRoute(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
    .replace(/\/\+[0-9]+/g, '/:phone');
}
