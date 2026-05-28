import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  authenticateJwt,
  rateLimiter,
  requireRole,
  resolveTenant,
  validate,
} from '../../../middleware/index.js';
import { AuthorizationError } from '../../../lib/errors.js';
import {
  dentallyVerificationService,
  isDentallyVerificationRouteAllowed,
  type DentallyVerificationResult,
  type DentallyVerificationType,
} from '../adapters/dentally/dentally-verification.service.js';
import { DentallyFeatureDisabledError } from '../adapters/dentally/dentally.errors.js';
import { isDentallyFeatureEnabled } from '../adapters/dentally/dentally.auth.js';
import { isDentallyControlledPilotMode } from '../adapters/dentally/dentally-sandbox-safety.js';

const baseSchema = z.object({
  integrationId: z.string().uuid().optional(),
});

const patientLookupSchema = baseSchema.extend({
  phoneNumber: z.string().min(7).max(32).optional(),
});

const appointmentReadSchema = baseSchema.extend({
  startIso: z.string().datetime().optional(),
  endIso: z.string().datetime().optional(),
});

const appointmentCreateSchema = baseSchema.extend({
  patientId: z.string().min(1).max(128).optional(),
  slot: z
    .object({
      startIso: z.string().datetime(),
      endIso: z.string().datetime(),
    })
    .optional(),
  reason: z.string().min(1).max(200).optional(),
  executeVendorWrite: z.boolean().optional(),
});

const appointmentCancelSchema = baseSchema.extend({
  appointmentId: z.string().min(1).max(128).optional(),
  executeVendorWrite: z.boolean().optional(),
});

const webhookSchema = baseSchema.extend({
  rawBody: z.string().min(2).max(20_000).optional(),
  signature: z.string().min(8).max(512).optional(),
  timestamp: z.string().min(1).max(32).optional(),
});

const reportQuerySchema = z.object({
  integrationId: z.string().uuid().optional(),
});

export const dentallyVerificationRouter = Router();
const controlledPilotRateLimiter = rateLimiter({
  maxRequests: 10,
  windowSeconds: 60,
  keyPrefix: 'dentally-verification-pilot',
  keyExtractor: (req) => req.tenantContext?.tenantId ?? req.ip ?? null,
});

dentallyVerificationRouter.use(
  authenticateJwt,
  resolveTenant,
  requireRole('owner', 'admin', 'platform_admin'),
);
dentallyVerificationRouter.use((req, _res, next) => {
  if (!isDentallyFeatureEnabled()) {
    next(new DentallyFeatureDisabledError());
    return;
  }
  if (!isDentallyVerificationRouteAllowed()) {
    next(new AuthorizationError('Dentally verification is disabled in production'));
    return;
  }
  next();
});
dentallyVerificationRouter.use((req, res, next) => {
  if (!isDentallyControlledPilotMode()) {
    next();
    return;
  }
  void controlledPilotRateLimiter(req, res, next);
});

function tenantId(req: Request): string {
  return req.tenantContext!.tenantId;
}

function correlationId(req: Request): string | undefined {
  return req.tenantContext?.correlationId;
}

function auditResult(
  req: Request,
  action: string,
  result: DentallyVerificationResult | { readinessScore: number; integrationId: string },
): void {
  const afterState =
    'verificationType' in result
      ? {
          verificationType: result.verificationType,
          status: result.status,
          durationMs: result.durationMs,
          writeMode: result.responseMetadata.writeMode,
          providerRequestId: result.requestMetadata.providerRequestId,
        }
      : {
          readinessScore: result.readinessScore,
        };
  req.audit?.({
    action,
    entityType: 'dentally_verification_run',
    entityId: 'verificationType' in result ? result.runId : result.integrationId,
    afterState,
  });
}

async function runVerification(
  req: Request,
  action: string | ((result: DentallyVerificationResult) => string),
  verificationType: DentallyVerificationType,
  callback: () => Promise<DentallyVerificationResult>,
): Promise<DentallyVerificationResult> {
  const result = await callback();
  auditResult(req, typeof action === 'function' ? action(result) : action, result);
  return {
    runId: result.runId,
    verificationType,
    status: result.status,
    requestMetadata: result.requestMetadata,
    responseMetadata: result.responseMetadata,
    durationMs: result.durationMs,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  };
}

dentallyVerificationRouter.post(
  '/connectivity',
  validate({ body: baseSchema }),
  async (req, res, next) => {
    try {
      const result = await runVerification(
        req,
        'dentally.verify.connectivity',
        'connectivity',
        () =>
          dentallyVerificationService.verifyConnectivity({
            tenantId: tenantId(req),
            integrationId: req.body.integrationId,
            correlationId: correlationId(req),
          }),
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

dentallyVerificationRouter.post(
  '/credentials',
  validate({ body: baseSchema }),
  async (req, res, next) => {
    try {
      const result = await runVerification(req, 'dentally.verify.credentials', 'credentials', () =>
        dentallyVerificationService.verifyCredentials({
          tenantId: tenantId(req),
          integrationId: req.body.integrationId,
          correlationId: correlationId(req),
        }),
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

dentallyVerificationRouter.post(
  '/scopes',
  validate({ body: baseSchema }),
  async (req, res, next) => {
    try {
      const result = await runVerification(req, 'dentally.verify.scopes', 'scopes', () =>
        dentallyVerificationService.verifyScopes({
          tenantId: tenantId(req),
          integrationId: req.body.integrationId,
          correlationId: correlationId(req),
        }),
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

dentallyVerificationRouter.post(
  '/patient-lookup',
  validate({ body: patientLookupSchema }),
  async (req, res, next) => {
    try {
      const result = await runVerification(
        req,
        'dentally.verify.patient_lookup',
        'patient_lookup',
        () =>
          dentallyVerificationService.verifyPatientLookup({
            tenantId: tenantId(req),
            integrationId: req.body.integrationId,
            correlationId: correlationId(req),
            phoneNumber: req.body.phoneNumber,
          }),
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

dentallyVerificationRouter.post(
  '/appointment-read',
  validate({ body: appointmentReadSchema }),
  async (req, res, next) => {
    try {
      const result = await runVerification(
        req,
        'dentally.verify.appointment_read',
        'appointment_read',
        () =>
          dentallyVerificationService.verifyAppointmentRead({
            tenantId: tenantId(req),
            integrationId: req.body.integrationId,
            correlationId: correlationId(req),
            startIso: req.body.startIso,
            endIso: req.body.endIso,
          }),
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

dentallyVerificationRouter.post(
  '/appointment-create',
  validate({ body: appointmentCreateSchema }),
  async (req, res, next) => {
    try {
      const result = await runVerification(
        req,
        (result) =>
          result.responseMetadata.executedVendorWrite === true
            ? 'dentally.verify.create_live'
            : 'dentally.verify.create_dry_run',
        'appointment_create',
        () =>
          dentallyVerificationService.verifyAppointmentCreateDryRun({
            tenantId: tenantId(req),
            integrationId: req.body.integrationId,
            correlationId: correlationId(req),
            patientId: req.body.patientId,
            slot: req.body.slot,
            reason: req.body.reason,
            executeVendorWrite: req.body.executeVendorWrite,
          }),
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

dentallyVerificationRouter.post(
  '/appointment-cancel',
  validate({ body: appointmentCancelSchema }),
  async (req, res, next) => {
    try {
      const result = await runVerification(
        req,
        (result) =>
          result.responseMetadata.executedVendorWrite === true
            ? 'dentally.verify.cancel_live'
            : 'dentally.verify.cancel_dry_run',
        'appointment_cancel',
        () =>
          dentallyVerificationService.verifyAppointmentCancelDryRun({
            tenantId: tenantId(req),
            integrationId: req.body.integrationId,
            correlationId: correlationId(req),
            appointmentId: req.body.appointmentId,
            executeVendorWrite: req.body.executeVendorWrite,
          }),
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

dentallyVerificationRouter.post(
  '/webhook',
  validate({ body: webhookSchema }),
  async (req, res, next) => {
    try {
      const result = await runVerification(req, 'dentally.verify.webhook', 'webhook_delivery', () =>
        dentallyVerificationService.verifyWebhookDelivery({
          tenantId: tenantId(req),
          integrationId: req.body.integrationId,
          correlationId: correlationId(req),
          rawBody: req.body.rawBody,
          signature: req.body.signature,
          timestamp: req.body.timestamp,
        }),
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

dentallyVerificationRouter.get('/report', async (req, res, next) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const report = await dentallyVerificationService.generateVerificationReport({
      tenantId: tenantId(req),
      integrationId: query.integrationId,
      correlationId: correlationId(req),
    });
    auditResult(req, 'dentally.verify.report', report);
    res.json({ data: report });
  } catch (error) {
    next(error);
  }
});
