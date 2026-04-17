
import { Router } from 'express';
import * as billingService from './billing.service.js';
import * as stripeService from './stripe.js';
import { env } from '../../config/env.js';
import { authenticateJwt, resolveTenant, validate, apiRateLimiter } from '../../middleware/index.js';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import express from 'express';

export const billingRouter = Router();

// ─── Stripe webhook (must be BEFORE any JSON body parser) ───
billingRouter.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    try {
      const event = stripeService.constructWebhookEvent(req.body, signature);
      await stripeService.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (err: any) {
      logger.error({ err }, 'Stripe webhook error');
      res.status(400).json({ error: err.message });
    }
  },
);

// ─── All routes below require authentication ───
billingRouter.use(authenticateJwt, resolveTenant);

// ─── Create Stripe Checkout Session ───
billingRouter.post(
  '/create-checkout-session',
  apiRateLimiter,
  validate({
    body: z.object({
      planId: z.enum(['starter', 'growth', 'pro']),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await stripeService.createCheckoutSession({
        tenantId: req.tenantContext!.tenantId,
        planId: req.body.planId,
        successUrl: req.body.successUrl,
        cancelUrl: req.body.cancelUrl,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Create Stripe Billing Portal Session ───
billingRouter.post(
  '/create-portal-session',
  apiRateLimiter,
  async (req, res, next) => {
    try {
      const result = await stripeService.createBillingPortalSession({
        tenantId: req.tenantContext!.tenantId,
        returnUrl: req.body.returnUrl || `${env.CLIENT_URL.replace(/\/$/, '')}/dashboard/billing`,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get current subscription status ───
billingRouter.get('/subscription', async (req, res, next) => {
  try {
    const result = await stripeService.getSubscriptionStatus(req.tenantContext!.tenantId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Billing summary (existing) ───
billingRouter.get(
  '/summary',
  apiRateLimiter,
  validate({
    query: z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const now = new Date();
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : now;

      const summary = await billingService.getTenantBillingSummary({
        tenantId: req.tenantContext!.tenantId,
        startDate,
        endDate,
      });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Daily cost trend (existing) ───
billingRouter.get(
  '/trend',
  apiRateLimiter,
  validate({
    query: z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const now = new Date();
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : now;

      const trend = await billingService.getDailyCostTrend({
        tenantId: req.tenantContext!.tenantId,
        startDate,
        endDate,
      });
      res.json({ data: trend });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Plan limits (existing) ───
billingRouter.get('/limits', async (req, res, next) => {
  try {
    const result = await billingService.checkPlanLimits(req.tenantContext!.tenantId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
