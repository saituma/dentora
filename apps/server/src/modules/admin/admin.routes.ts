import { Router } from 'express';
import * as adminService from './admin.service.js';
import { authenticateJwt, requirePlatformAdmin, validate } from '../../middleware/index.js';
import { buyPoolNumber } from '../telephony/telephony.service.js';
import { z } from 'zod';
import { runDataRetention } from '../../lib/data-retention.js';
import { rateLimiter } from '../../middleware/rateLimit.js';
import { hashPassword, generateId } from '../../lib/crypto.js';
import { db } from '../../db/index.js';
import {
  users,
  tenantRegistry,
  tenantUsers,
  callSessions,
  callEvents,
  callTranscripts,
  clinicProfile,
  integrations,
  auditLog,
  tenantConfigVersions,
  pilotPreflightStatus,
} from '../../db/schema.js';
import { sql, eq, and, ilike, desc } from 'drizzle-orm';
import { logEmitter, getRecentLogs, type LogEntry } from './admin-log-stream.js';

export const adminRouter = Router();

// ─── Seed endpoint (no auth, rate limited) ───────────────────────────

const seedRateLimiter = rateLimiter({
  maxRequests: 1,
  windowSeconds: 60,
  keyPrefix: 'admin-seed',
  keyExtractor: (req) => req.ip || 'unknown',
});

adminRouter.post('/seed', seedRateLimiter, async (_req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Seed endpoint is disabled in production' });
      return;
    }

    const email = 'admin@gmail.com';
    const password = 'Password123!';
    const passwordHash = await hashPassword(password);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      await db
        .update(users)
        .set({
          passwordHash,
          displayName: 'Platform Admin',
          role: 'platform_admin',
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({
        id: generateId(),
        email,
        passwordHash,
        displayName: 'Platform Admin',
        role: 'platform_admin',
        emailVerified: true,
      });
    }

    res.json({ success: true, message: 'Admin user seeded', email });
  } catch (err) {
    next(err);
  }
});

// ─── Health (no auth) ────────────────────────────────────────────────

adminRouter.get('/health', async (_req, res, next) => {
  try {
    const health = await adminService.getPlatformHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    next(err);
  }
});

// ─── All routes below require platform admin ─────────────────────────

adminRouter.use(authenticateJwt, requirePlatformAdmin);

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const stats = await adminService.getPlatformStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/config/:key', async (req, res, next) => {
  try {
    const value = await adminService.getPlatformConfig(req.params.key as string);
    res.json({ key: req.params.key as string, value });
  } catch (err) {
    next(err);
  }
});

adminRouter.put(
  '/config/:key',
  validate({
    body: z.object({
      value: z.string(),
      description: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      await adminService.setPlatformConfig(
        req.params.key as string,
        req.body.value,
        req.body.description,
      );
      req.audit?.({
        action: 'admin.config_changed',
        entityType: 'platform_config',
        entityId: req.params.key as string,
        afterState: { value: req.body.value },
      });
      res.json({ message: 'Config updated' });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post('/data-retention/run', async (req, res, next) => {
  try {
    const result = await runDataRetention();
    req.audit?.({
      action: 'admin.data_retention_run',
      entityType: 'data_retention',
      afterState: result,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/tenants ──────────────────────────────────────────

adminRouter.get(
  '/tenants',
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

// ─── GET /api/admin/tenants/:tenantId ────────────────────────────────

adminRouter.get('/tenants/:tenantId', async (req, res, next) => {
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

    const profile = await db
      .select()
      .from(clinicProfile)
      .where(eq(clinicProfile.tenantId, tenantId));

    const tenantIntegrations = await db
      .select()
      .from(integrations)
      .where(eq(integrations.tenantId, tenantId));

    const tenantUserRows = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: tenantUsers.role,
        createdAt: users.createdAt,
      })
      .from(tenantUsers)
      .innerJoin(users, eq(tenantUsers.userId, users.id))
      .where(eq(tenantUsers.tenantId, tenantId));

    res.json({
      data: {
        ...tenant,
        clinicProfile: profile,
        integrations: tenantIntegrations,
        users: tenantUserRows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/calls ────────────────────────────────────────────

adminRouter.get(
  '/calls',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      tenantId: z.string().uuid().optional(),
      status: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { limit, offset, tenantId, status } = req.query as unknown as {
        limit: number;
        offset: number;
        tenantId?: string;
        status?: string;
      };

      const conditions = [];
      if (tenantId) conditions.push(eq(callSessions.tenantId, tenantId));
      if (status)
        conditions.push(
          eq(
            callSessions.status,
            status as 'started' | 'in_progress' | 'completed' | 'escalated' | 'failed',
          ),
        );

      const whereClause =
        conditions.length > 0
          ? conditions.length === 1
            ? conditions[0]
            : and(...conditions)
          : undefined;

      const rows = await db
        .select({
          id: callSessions.id,
          tenantId: callSessions.tenantId,
          clinicName: tenantRegistry.clinicName,
          twilioCallSid: callSessions.twilioCallSid,
          callerNumber: callSessions.callerNumber,
          clinicNumber: callSessions.clinicNumber,
          status: callSessions.status,
          intentSummary: callSessions.intentSummary,
          durationSeconds: callSessions.durationSeconds,
          endReason: callSessions.endReason,
          aiProvider: callSessions.aiProvider,
          aiModel: callSessions.aiModel,
          costEstimate: callSessions.costEstimate,
          metadata: callSessions.metadata,
          startedAt: callSessions.startedAt,
          endedAt: callSessions.endedAt,
          createdAt: callSessions.createdAt,
        })
        .from(callSessions)
        .leftJoin(tenantRegistry, eq(callSessions.tenantId, tenantRegistry.id))
        .where(whereClause)
        .orderBy(desc(callSessions.startedAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(callSessions)
        .where(whereClause);

      res.json({ data: rows, total: count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/admin/calls/:callId ────────────────────────────────────

adminRouter.get('/calls/:callId', async (req, res, next) => {
  try {
    const { callId } = req.params;

    const [callSession] = await db
      .select({
        id: callSessions.id,
        tenantId: callSessions.tenantId,
        clinicName: tenantRegistry.clinicName,
        twilioCallSid: callSessions.twilioCallSid,
        callerNumber: callSessions.callerNumber,
        clinicNumber: callSessions.clinicNumber,
        status: callSessions.status,
        intentSummary: callSessions.intentSummary,
        durationSeconds: callSessions.durationSeconds,
        endReason: callSessions.endReason,
        aiProvider: callSessions.aiProvider,
        aiModel: callSessions.aiModel,
        costEstimate: callSessions.costEstimate,
        metadata: callSessions.metadata,
        startedAt: callSessions.startedAt,
        endedAt: callSessions.endedAt,
        createdAt: callSessions.createdAt,
      })
      .from(callSessions)
      .leftJoin(tenantRegistry, eq(callSessions.tenantId, tenantRegistry.id))
      .where(eq(callSessions.id, callId))
      .limit(1);

    if (!callSession) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    const events = await db
      .select()
      .from(callEvents)
      .where(eq(callEvents.callSessionId, callId))
      .orderBy(callEvents.timestamp);

    const transcripts = await db
      .select()
      .from(callTranscripts)
      .where(eq(callTranscripts.callSessionId, callId));

    res.json({
      data: {
        ...callSession,
        events,
        transcripts,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/audit-log ────────────────────────────────────────

adminRouter.get(
  '/audit-log',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      tenantId: z.string().uuid().optional(),
      action: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { limit, offset, tenantId, action } = req.query as unknown as {
        limit: number;
        offset: number;
        tenantId?: string;
        action?: string;
      };

      const conditions = [];
      if (tenantId) conditions.push(eq(auditLog.tenantId, tenantId));
      if (action) conditions.push(eq(auditLog.action, action));

      const whereClause =
        conditions.length > 0
          ? conditions.length === 1
            ? conditions[0]
            : and(...conditions)
          : undefined;

      const rows = await db
        .select()
        .from(auditLog)
        .where(whereClause)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(auditLog)
        .where(whereClause);

      res.json({ data: rows, total: count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/admin/users ────────────────────────────────────────────

adminRouter.get(
  '/users',
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

      const conditions = search ? ilike(users.email, `%${search}%`) : undefined;

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          createdAt: users.createdAt,
          tenantId: tenantUsers.tenantId,
          clinicName: tenantRegistry.clinicName,
        })
        .from(users)
        .leftJoin(tenantUsers, eq(users.id, tenantUsers.userId))
        .leftJoin(tenantRegistry, eq(tenantUsers.tenantId, tenantRegistry.id))
        .where(conditions)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(users)
        .where(conditions);

      res.json({ data: rows, total: count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/admin/users/:id ────────────────────────────────────────

adminRouter.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        emailVerified: users.emailVerified,
        mfaEnabled: users.mfaEnabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Fetch tenant membership
    const [membership] = await db
      .select({
        tenantId: tenantUsers.tenantId,
        tenantRole: tenantUsers.role,
        clinicName: tenantRegistry.clinicName,
        clinicSlug: tenantRegistry.clinicSlug,
        plan: tenantRegistry.plan,
        status: tenantRegistry.status,
        stripeCustomerId: tenantRegistry.stripeCustomerId,
        stripeSubscriptionId: tenantRegistry.stripeSubscriptionId,
        tenantCreatedAt: tenantRegistry.createdAt,
      })
      .from(tenantUsers)
      .innerJoin(tenantRegistry, eq(tenantUsers.tenantId, tenantRegistry.id))
      .where(eq(tenantUsers.userId, id))
      .limit(1);

    let tenant = null;

    if (membership) {
      const { tenantId } = membership;

      // Clinic profile (latest by config version desc)
      const [profile] = await db
        .select({
          id: clinicProfile.id,
          clinicName: clinicProfile.clinicName,
          legalEntityName: clinicProfile.legalEntityName,
          timezone: clinicProfile.timezone,
          primaryPhone: clinicProfile.primaryPhone,
          supportEmail: clinicProfile.supportEmail,
          address: clinicProfile.address,
          phone: clinicProfile.phone,
          email: clinicProfile.email,
          website: clinicProfile.website,
          businessHours: clinicProfile.businessHours,
          specialties: clinicProfile.specialties,
          staffMembers: clinicProfile.staffMembers,
          description: clinicProfile.description,
          status: clinicProfile.status,
          configVersion: clinicProfile.configVersion,
          updatedAt: clinicProfile.updatedAt,
        })
        .from(clinicProfile)
        .where(eq(clinicProfile.tenantId, tenantId))
        .orderBy(desc(clinicProfile.configVersion))
        .limit(1);

      // Latest config version
      const [latestConfig] = await db
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

      // Preflight status
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

      tenant = {
        id: tenantId,
        tenantRole: membership.tenantRole,
        clinicName: membership.clinicName,
        clinicSlug: membership.clinicSlug,
        plan: membership.plan,
        status: membership.status,
        stripeCustomerId: membership.stripeCustomerId,
        stripeSubscriptionId: membership.stripeSubscriptionId,
        createdAt: membership.tenantCreatedAt,
        clinicProfile: profile ?? null,
        latestConfigVersion: latestConfig ?? null,
        preflight: preflight ?? null,
      };
    }

    res.json({ ...user, tenant });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/live-logs (SSE) ──────────────────────────────────

adminRouter.get('/live-logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send recent logs as initial payload
  const recent = getRecentLogs();
  for (const entry of recent) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  const onLog = (entry: LogEntry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  logEmitter.on('log', onLog);

  req.on('close', () => {
    logEmitter.off('log', onLog);
  });
});

// ─── Phone number pool ────────────────────────────────────────────────

adminRouter.post(
  '/phone-pool/buy',
  authenticateJwt,
  requirePlatformAdmin,
  validate({ body: z.object({ countryCode: z.string().length(2).optional() }) }),
  async (req, res, next) => {
    try {
      const number = await buyPoolNumber(req.body.countryCode);
      res.status(201).json({ number });
    } catch (err) {
      next(err);
    }
  },
);
