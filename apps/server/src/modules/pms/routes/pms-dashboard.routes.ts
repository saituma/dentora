import { Router } from 'express';
import { z } from 'zod';
import {
  authenticateJwt,
  apiRateLimiter,
  requireRole,
  resolveTenant,
  validate,
} from '../../../middleware/index.js';
import {
  integrationEventsFilterSchema,
  providerConfigureBodySchema,
  providerParamSchema,
  schedulingConfigUpdateSchema,
  type IntegrationEventsFilterInput,
  type ProviderConfigureInput,
  type ReadinessChecklistItem,
  type SchedulingConfigUpdateInput,
} from '../pms-dashboard.types.js';
import {
  evaluateVendorProductionReadiness,
  isVendorShellProvider,
  type VendorReadinessInputItem,
} from '../adapters/vendor-readiness.js';
import { getPmsProviderOverview } from '../services/pms-provider-overview.service.js';
import {
  configurePmsProvider,
  disconnectPmsProvider,
  getPmsProviderDetail,
} from '../services/pms-provider-detail.service.js';
import { getVendorAccessPacket } from '../services/vendor-access-packet.service.js';
import { listPmsIntegrationEvents } from '../services/pms-integration-events.service.js';
import {
  getTenantSchedulingConfig,
  updateTenantSchedulingConfig,
} from '../services/tenant-scheduling-config.service.js';
import { dentallyVerificationRouter } from './dentally-verification.routes.js';
import { pmsWebhooksRouter } from './pms-webhooks.routes.js';

export const pmsDashboardRouter = Router();

function safeReadinessSummary(items: readonly VendorReadinessInputItem[]): Array<{
  id: string;
  status: string;
  notePresent: boolean;
  noteLength: number;
}> {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    notePresent: Boolean(item.note?.trim()),
    noteLength: item.note?.trim().length ?? 0,
    evidenceUrlPresent: Boolean(item.evidenceUrl?.trim()),
    evidenceUrlLength: item.evidenceUrl?.trim().length ?? 0,
  }));
}

function checklistItemsForAudit(
  items: readonly ReadinessChecklistItem[],
): VendorReadinessInputItem[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    note: item.note,
    evidenceUrl: item.evidenceUrl,
  }));
}

function changedReadinessIds(input: {
  before: readonly VendorReadinessInputItem[];
  after: readonly VendorReadinessInputItem[];
}): string[] {
  const beforeById = new Map(input.before.map((item) => [item.id, item]));
  return input.after
    .filter((item) => {
      const before = beforeById.get(item.id);
      return (
        !before ||
        before.status !== item.status ||
        (before.note?.trim() ?? '') !== (item.note?.trim() ?? '') ||
        (before.evidenceUrl?.trim() ?? '') !== (item.evidenceUrl?.trim() ?? '')
      );
    })
    .map((item) => item.id);
}

pmsDashboardRouter.use('/webhooks', pmsWebhooksRouter);
pmsDashboardRouter.use('/dentally/verify', dentallyVerificationRouter);

pmsDashboardRouter.use(
  authenticateJwt,
  resolveTenant,
  requireRole('owner', 'admin', 'platform_admin'),
);

pmsDashboardRouter.get('/providers', async (req, res, next) => {
  try {
    const data = await getPmsProviderOverview(req.tenantContext!.tenantId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

pmsDashboardRouter.get(
  '/providers/:provider',
  validate({ params: providerParamSchema }),
  async (req, res, next) => {
    try {
      const params = providerParamSchema.parse(req.params);
      const data = await getPmsProviderDetail({
        tenantId: req.tenantContext!.tenantId,
        provider: params.provider,
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
);

pmsDashboardRouter.get(
  '/providers/:provider/vendor-access-packet',
  validate({ params: providerParamSchema }),
  async (req, res, next) => {
    try {
      const params = providerParamSchema.parse(req.params);
      const data = getVendorAccessPacket({
        tenantId: req.tenantContext!.tenantId,
        provider: params.provider,
      });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

pmsDashboardRouter.get('/scheduling-config', async (req, res, next) => {
  try {
    const data = await getTenantSchedulingConfig(req.tenantContext!.tenantId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

pmsDashboardRouter.put(
  '/scheduling-config',
  apiRateLimiter,
  validate({ body: schedulingConfigUpdateSchema }),
  async (req, res, next) => {
    try {
      const body = schedulingConfigUpdateSchema.parse(req.body) as SchedulingConfigUpdateInput;
      const data = await updateTenantSchedulingConfig({
        tenantId: req.tenantContext!.tenantId,
        ...body,
      });
      req.audit?.({
        action: 'pms.scheduling_config.updated',
        entityType: 'tenant_scheduling_config',
        entityId: data.id,
        afterState: {
          primaryProvider: data.primaryProvider,
          fallbackProvider: data.fallbackProvider,
          sourceOfTruth: data.sourceOfTruth,
          googleSyncMode: data.googleSyncMode,
        },
      });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

pmsDashboardRouter.get(
  '/integration-events',
  validate({ query: integrationEventsFilterSchema }),
  async (req, res, next) => {
    try {
      const filters = integrationEventsFilterSchema.parse(
        req.query,
      ) as IntegrationEventsFilterInput;
      const data = await listPmsIntegrationEvents({
        tenantId: req.tenantContext!.tenantId,
        filters,
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
);

pmsDashboardRouter.post(
  '/providers/:provider/configure',
  apiRateLimiter,
  validate({ params: providerParamSchema, body: providerConfigureBodySchema }),
  async (req, res, next) => {
    try {
      const params = providerParamSchema.parse(req.params);
      const body = providerConfigureBodySchema.parse(req.body) as ProviderConfigureInput;
      const vendorReadinessProvider = isVendorShellProvider(params.provider)
        ? params.provider
        : null;
      const readinessAuditEnabled =
        Boolean(vendorReadinessProvider) && Array.isArray(body.readinessChecklist);
      const beforeReadiness = readinessAuditEnabled
        ? checklistItemsForAudit(
            (
              await getPmsProviderDetail({
                tenantId: req.tenantContext!.tenantId,
                provider: params.provider,
              })
            ).readinessChecklist,
          )
        : [];
      const data = await configurePmsProvider({
        tenantId: req.tenantContext!.tenantId,
        provider: params.provider,
        body,
      });
      if (readinessAuditEnabled) {
        const afterReadiness = body.readinessChecklist ?? [];
        const productionReadiness = evaluateVendorProductionReadiness({
          provider: vendorReadinessProvider!,
          readinessChecklist: afterReadiness,
        });
        req.audit?.({
          action: 'pms.vendor_readiness.updated',
          entityType: 'pms_vendor_readiness',
          entityId: params.provider,
          beforeState: {
            provider: params.provider,
            readinessChecklist: safeReadinessSummary(beforeReadiness),
          },
          afterState: {
            provider: params.provider,
            readinessChecklist: safeReadinessSummary(afterReadiness),
            changedChecklistIds: changedReadinessIds({
              before: beforeReadiness,
              after: afterReadiness,
            }),
            score: productionReadiness.score,
            readyForImplementation: productionReadiness.readyForImplementation,
            readyForProduction: productionReadiness.readyForProduction,
          },
        });
      }
      req.audit?.({
        action: 'pms.provider.configured',
        entityType: 'integration',
        entityId: params.provider,
        afterState: { provider: params.provider, secretsReturned: false },
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
);

pmsDashboardRouter.post(
  '/providers/:provider/disconnect',
  apiRateLimiter,
  validate({ params: providerParamSchema, body: z.object({}).default({}) }),
  async (req, res, next) => {
    try {
      const params = providerParamSchema.parse(req.params);
      const data = await disconnectPmsProvider({
        tenantId: req.tenantContext!.tenantId,
        provider: params.provider,
      });
      req.audit?.({
        action: 'pms.provider.disconnected',
        entityType: 'integration',
        entityId: params.provider,
        afterState: { provider: params.provider },
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
);
