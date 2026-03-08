
import { Router } from 'express';
import * as integrationService from './integration.service.js';
import { authenticateJwt, resolveTenant, validate, apiRateLimiter } from '../../middleware/index.js';
import { z } from 'zod';
import { env } from '../../config/env.js';

export const integrationRouter = Router();

function buildRedirect(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

integrationRouter.get('/google/calendar/oauth/callback', async (req, res) => {
  const successRedirect = env.GOOGLE_OAUTH_SUCCESS_REDIRECT || `${env.CORS_ORIGIN}/onboarding/test-call`;
  const errorRedirect = env.GOOGLE_OAUTH_ERROR_REDIRECT || `${env.CORS_ORIGIN}/onboarding/test-call`;

  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;
  const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined;

  if (oauthError) {
    res.redirect(buildRedirect(errorRedirect, { googleCalendar: 'failed', reason: oauthError }));
    return;
  }

  if (!code || !state) {
    res.redirect(buildRedirect(errorRedirect, { googleCalendar: 'failed', reason: 'missing_code_or_state' }));
    return;
  }

  try {
    const result = await integrationService.completeGoogleCalendarOAuth({ code, state });
    res.redirect(buildRedirect(result.returnTo || successRedirect, {
      googleCalendar: 'connected',
      integrationId: result.integrationId,
    }));
  } catch {
    res.redirect(buildRedirect(errorRedirect, { googleCalendar: 'failed', reason: 'oauth_callback_failed' }));
  }
});

integrationRouter.use(authenticateJwt, resolveTenant);

integrationRouter.post(
  '/google/calendar/oauth/start',
  apiRateLimiter,
  validate({
    body: z.object({
      accountEmail: z.string().email().optional(),
      calendarId: z.string().min(1).optional(),
      returnTo: z.string().min(1).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await integrationService.startGoogleCalendarOAuth({
        tenantId: req.tenantContext!.tenantId,
        accountEmail: req.body.accountEmail,
        calendarId: req.body.calendarId,
        returnTo: req.body.returnTo,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

integrationRouter.post(
  '/',
  apiRateLimiter,
  validate({
    body: z.object({
      integrationType: z.enum(['pms', 'calendar', 'crm', 'messaging']),
      provider: z.string().min(1).optional(),
      config: z.record(z.string(), z.unknown()),
      credentials: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const integration = await integrationService.upsertIntegration({
        tenantId: req.tenantContext!.tenantId,
        ...req.body,
      });
      req.audit?.({
        action: 'integration.upserted',
        entityType: 'integration',
        entityId: integration.id,
        afterState: { type: req.body.integrationType },
      });
      res.status(201).json(integration);
    } catch (err) {
      next(err);
    }
  },
);

integrationRouter.get('/', async (req, res, next) => {
  try {
    const items = await integrationService.getIntegrations(req.tenantContext!.tenantId);
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

integrationRouter.post('/:id/activate', async (req, res, next) => {
  try {
    const integration = await integrationService.activateIntegration(
      req.tenantContext!.tenantId,
      req.params.id,
    );
    res.json(integration);
  } catch (err) {
    next(err);
  }
});

integrationRouter.post('/:id/test', async (req, res, next) => {
  try {
    const result = await integrationService.testIntegration(
      req.tenantContext!.tenantId,
      req.params.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

integrationRouter.delete('/:id', async (req, res, next) => {
  try {
    await integrationService.deleteIntegration(req.tenantContext!.tenantId, req.params.id);
    req.audit?.({
      action: 'integration.deleted',
      entityType: 'integration',
      entityId: req.params.id,
    });
    res.json({ message: 'Integration deleted' });
  } catch (err) {
    next(err);
  }
});
