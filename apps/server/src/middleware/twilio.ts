import type { Request, Response, NextFunction } from 'express';
import { validateRequest } from 'twilio/lib/webhooks/webhooks.js';
import { env } from '../config/env.js';
import { ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function validateTwilioSignature(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!env.TWILIO_AUTH_TOKEN) {
      logger.warn('TWILIO_AUTH_TOKEN not set; skipping Twilio signature validation');
      next();
      return;
    }

    const signature = (req.headers['x-twilio-signature'] || '') as string;
    if (!signature) {
      logger.warn(
        { path: req.originalUrl, method: req.method },
        'Missing X-Twilio-Signature header',
      );
      throw new ValidationError('Missing X-Twilio-Signature header');
    }

    const baseUrl = env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, '') ?? '';
    const fullUrl = `${baseUrl}${req.originalUrl}`;
    const params = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};

    const isValid = validateRequest(
      env.TWILIO_AUTH_TOKEN,
      signature,
      fullUrl,
      params,
    );

    if (!isValid) {
      logger.warn(
        {
          fullUrl,
          path: req.originalUrl,
          method: req.method,
          paramCount: Object.keys(params).length,
        },
        'Invalid Twilio signature',
      );
      throw new ValidationError('Invalid Twilio signature');
    }

    logger.info(
      { path: req.originalUrl, method: req.method },
      'Twilio signature validated',
    );

    next();
  } catch (error) {
    next(error);
  }
}
