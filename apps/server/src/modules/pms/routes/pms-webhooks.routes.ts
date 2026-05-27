import { Router, type Request } from 'express';
import { z } from 'zod';
import { validate } from '../../../middleware/index.js';
import { runWithTenantContext } from '../../../db/tenant-context.js';
import { handleDentallyWebhookEvent } from '../adapters/dentally/dentally.webhook.js';

const webhookParamsSchema = z.object({
  tenantId: z.string().uuid(),
  integrationId: z.string().uuid(),
});

export const pmsWebhooksRouter = Router();

interface RawBodyRequest extends Request {
  rawBody?: string;
}

pmsWebhooksRouter.post(
  '/dentally/:tenantId/:integrationId',
  validate({ params: webhookParamsSchema }),
  async (req, res, next) => {
    try {
      const { tenantId, integrationId } = webhookParamsSchema.parse(req.params);
      const rawBody = (req as RawBodyRequest).rawBody ?? JSON.stringify(req.body ?? {});
      const result = await runWithTenantContext({ tenantId, source: 'webhook' }, () =>
        handleDentallyWebhookEvent({
          tenantId,
          integrationId,
          payload: req.body,
          rawBody,
          headers: req.headers,
        }),
      );

      res.status(202).json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);
