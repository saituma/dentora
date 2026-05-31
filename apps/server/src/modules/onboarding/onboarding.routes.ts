import { Router } from 'express';
import { authenticateJwt, resolveTenant, validate } from '../../middleware/index.js';
import { z } from 'zod';
import * as onboardingService from './onboarding.service.js';
import { onboardingConfigRouter } from './routes/onboarding-config.routes.js';
import { onboardingDocsRouter } from './routes/onboarding-docs.routes.js';
import { onboardingAiRouter } from './routes/onboarding-ai.routes.js';
import { onboardingExportRouter } from './routes/onboarding-export.routes.js';

export const onboardingRouter = Router();

onboardingRouter.use(authenticateJwt, resolveTenant);

// ─── Status / readiness / preflight ──────────────────────────────────────────

onboardingRouter.get('/status', async (req, res, next) => {
  try {
    res.json(await onboardingService.getOnboardingStatus(req.tenantContext!.tenantId));
  } catch (err) {
    next(err);
  }
});

onboardingRouter.get('/readiness', async (req, res, next) => {
  try {
    res.json(await onboardingService.computeOnboardingReadiness(req.tenantContext!.tenantId));
  } catch (err) {
    next(err);
  }
});

onboardingRouter.get(
  '/pilot-preflight',
  validate({ query: z.object({ runCalendarPhiScan: z.coerce.boolean().optional() }) }),
  async (req, res, next) => {
    try {
      const query = req.query as unknown as { runCalendarPhiScan?: boolean };
      const report = await onboardingService.getPilotPreflightReport({
        tenantId: req.tenantContext!.tenantId,
        runCalendarPhiScan: query.runCalendarPhiScan === true,
      });
      req.audit?.({
        action: 'onboarding.pilot_preflight',
        entityType: 'tenant',
        entityId: req.tenantContext!.tenantId,
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Sub-routers ──────────────────────────────────────────────────────────────

onboardingRouter.use(onboardingConfigRouter);
onboardingRouter.use(onboardingDocsRouter);
onboardingRouter.use(onboardingAiRouter);
onboardingRouter.use(onboardingExportRouter);
