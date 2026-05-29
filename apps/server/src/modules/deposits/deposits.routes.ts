import { Router } from 'express';
import { authenticateJwt, resolveTenant, rateLimiter } from '../../middleware/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { verifyWebhookSignature } from '../../lib/stripe.js';
import { getDepositByAppointmentId, handleStripeEvent } from './deposit.service.js';

const depositsRateLimiter = rateLimiter({
  maxRequests: 120,
  windowSeconds: 60,
  keyPrefix: 'deposits',
});

/**
 * Stripe webhook router — mounted at /api/webhooks (already CSRF-exempt). The route relies on the
 * raw request body captured by captureRawBodyForPmsWebhooks for signature verification.
 */
export const stripeWebhookRouter = Router();

stripeWebhookRouter.post('/stripe', async (req, res) => {
  const rawBody = (req as unknown as { rawBody?: string }).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: 'Missing raw body' });
    return;
  }

  let event;
  try {
    event = verifyWebhookSignature(
      rawBody,
      req.header('stripe-signature') ?? undefined,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    logger.warn({ err }, 'Stripe webhook signature verification failed');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (err) {
    // Return 500 so Stripe retries — handlers are idempotent.
    logger.error({ err, eventId: event.id }, 'Stripe webhook handler failed');
    res.status(500).json({ error: 'Handler error' });
  }
});

/** Authenticated dashboard endpoints. */
export const depositsRouter = Router();

depositsRouter.get(
  '/appointment/:appointmentId',
  authenticateJwt,
  resolveTenant,
  depositsRateLimiter,
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const deposit = await getDepositByAppointmentId({
        tenantId,
        appointmentId: String(req.params.appointmentId),
      });
      res.json({ data: deposit });
    } catch (error) {
      next(error);
    }
  },
);
