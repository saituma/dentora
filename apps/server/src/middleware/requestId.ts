
import type { Request, Response, NextFunction } from 'express';
import { generateCorrelationId } from '../lib/crypto.js';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-correlation-id'] as string) || generateCorrelationId();
  req.headers['x-correlation-id'] = id;
  res.setHeader('x-correlation-id', id);
  next();
}
