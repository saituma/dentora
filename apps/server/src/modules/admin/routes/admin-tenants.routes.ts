import { Router } from 'express';
import { validate } from '../../../middleware/index.js';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import {
  tenantRegistry,
  callSessions,
  clinicProfile,
  integrations,
  users,
  tenantUsers,
  tenantConfigVersions,
  pilotPreflightStatus,
} from '../../../db/schema.js';
import { sql, eq, ilike, desc } from 'drizzle-orm';
import { startCalendarPhiRemediationDryRun } from '../../integrations/calendar-phi-remediation.service.js';
import { tenantCacheInvalidateDomain } from '../../../lib/cache.js';
import * as adminActions from '../admin-actions.service.js';

export const adminTenantsRouter = Router();

// ─── List tenants ─────────────────────────────────────────────────────────────

adminTenantsRouter.get(
  '/',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      search: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { limit, offset, search } = req.query as unknown as {
        limit: number;
        offset: number;
        search?: string;
      };

      const conditions = search ? ilike(tenantRegistry.clinicName, `%${search}%`) : undefined;

      const rows = await db
        .select({
          id: tenantRegistry.id,
          clinicName: tenantRegistry.clinicName,
          clinicSlug: tenantRegistry.clinicSlug,
          plan: tenantRegistry.plan,
          status: tenantRegistry.status,
          stripeCustomerId: tenantRegistry.stripeCustomerId,
          stripeSubscriptionId: tenantRegistry.stripeSubscriptionId,
          stripePriceId: tenantRegistry.stripePriceId,
          createdAt: tenantRegistry.createdAt,
          updatedAt: tenantRegistry.updatedAt,
          totalCalls: sql<number>`(SELECT COUNT(*)::int FROM call_sessions WHERE tenant_id = ${tenantRegistry.id})`,
          activeNumbers: sql<number>`(SELECT COUNT(*)::int FROM twilio_numbers WHERE tenant_id = ${tenantRegistry.id} AND status = 'active')`,
        })
        .from(tenantRegistry)
        .where(conditions)
        .orderBy(desc(tenantRegistry.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(tenantRegistry)
        .where(conditions);

      res.json({ data: rows, total: count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get tenant detail ────────────────────────────────────────────────────────

adminTenantsRouter.get('/:tenantId', async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const [tenant] = await db
      .select()
      .from(tenantRegistry)
      .where(eq(tenantRegistry.id, tenantId))
      .limit(1);

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    const [profile, tenantIntegrations, tenantUserRows] = await Promise.all([
      db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)),
      db.select().from(integrations).where(eq(integrations.tenantId, tenantId)),
      db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: tenantUsers.role,
          createdAt: users.createdAt,
        })
        .from(tenantUsers)
        .innerJoin(users, eq(tenantUsers.userId, users.id))
        .where(eq(tenantUsers.tenantId, tenantId)),
    ]);

    const [latestConfigVersion] = await db
      .select({
        version: tenantConfigVersions.version,
        status: tenantConfigVersions.status,
        completenessScore: tenantConfigVersions.completenessScore,
        publishedAt: tenantConfigVersions.publishedAt,
        createdAt: tenantConfigVersions.createdAt,
      })
      .from(tenantConfigVersions)
      .where(eq(tenantConfigVersions.tenantId, tenantId))
      .orderBy(desc(tenantConfigVersions.version))
      .limit(1);

    const [preflight] = await db
      .select({
        lastPreflightReady: pilotPreflightStatus.lastPreflightReady,
        lastPreflightCheckedAt: pilotPreflightStatus.lastPreflightCheckedAt,
        lastBlockingIssueCodes: pilotPreflightStatus.lastBlockingIssueCodes,
        lastWarningCodes: pilotPreflightStatus.lastWarningCodes,
        latestCalendarPhiScanAt: pilotPreflightStatus.latestCalendarPhiScanAt,
        latestCalendarPhiTotalEvents: pilotPreflightStatus.latestCalendarPhiTotalEvents,
        latestCalendarPhiRiskyEvents: pilotPreflightStatus.latestCalendarPhiRiskyEvents,
      })
      .from(pilotPreflightStatus)
      .where(eq(pilotPreflightStatus.tenantId, tenantId))
      .limit(1);

    res.json({
      data: {
        ...tenant,
        clinicProfile: profile,
        integrations: tenantIntegrations,
        users: tenantUserRows,
        latestConfigVersion: latestConfigVersion ?? null,
        preflight: preflight ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get tenant calls ─────────────────────────────────────────────────────────

adminTenantsRouter.get(
  '/:tenantId/calls',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.params.tenantId as string;
      const { limit, offset } = req.query as unknown as { limit: number; offset: number };

      const [rows, [{ count }]] = await Promise.all([
        db
          .select({
            id: callSessions.id,
            status: callSessions.status,
            callerNumber: callSessions.callerNumber,
            intentSummary: callSessions.intentSummary,
            durationSeconds: callSessions.durationSeconds,
            costEstimate: callSessions.costEstimate,
            startedAt: callSessions.startedAt,
          })
          .from(callSessions)
          .where(eq(callSessions.tenantId, tenantId))
          .orderBy(desc(callSessions.startedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(callSessions)
          .where(eq(callSessions.tenantId, tenantId)),
      ]);

      res.json({ data: rows, total: count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Update plan ──────────────────────────────────────────────────────────────

adminTenantsRouter.patch(
  '/:tenantId/plan',
  validate({
    body: z.object({ plan: z.enum(['starter', 'professional', 'enterprise']) }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.params.tenantId as string;
      const { plan } = req.body as { plan: adminActions.TenantPlan };
      await adminActions.updateTenantPlan(tenantId, plan);
      req.audit?.({
        action: 'admin.tenant_plan_changed',
        entityType: 'tenant',
        entityId: tenantId,
        afterState: { plan },
      });
      res.json({ message: 'Plan updated', plan });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Invalidate config cache ──────────────────────────────────────────────────

adminTenantsRouter.post('/:tenantId/invalidate-config-cache', async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId as string;
    const cleared = await tenantCacheInvalidateDomain(tenantId, 'config');
    req.audit?.({
      action: 'admin.tenant_config_cache_invalidated',
      entityType: 'tenant',
      entityId: tenantId,
      afterState: { keysCleared: cleared },
    });
    res.json({ message: 'Config cache invalidated', keysCleared: cleared });
  } catch (err) {
    next(err);
  }
});

// ─── PHI remediation dry-run ──────────────────────────────────────────────────

adminTenantsRouter.post('/:tenantId/phi-remediation/dry-run', async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId as string;
    const result = await startCalendarPhiRemediationDryRun({ tenantId });
    req.audit?.({
      action: 'admin.phi_remediation_dry_run',
      entityType: 'tenant',
      entityId: tenantId,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
