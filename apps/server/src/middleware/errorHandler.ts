
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const err = new AppError(`Route not found: ${req.method} ${req.path}`, 404, 'ROUTE_NOT_FOUND');
  next(err);
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.tenantContext?.correlationId ?? (req.headers['x-correlation-id'] as string);

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, correlationId, path: req.path }, err.message);
    } else {
      logger.warn({ err, correlationId, path: req.path }, err.message);
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      correlationId,
    });
    return;
  }

  logger.error({ err, correlationId, path: req.path }, 'Unhandled error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    correlationId,
  });
}
