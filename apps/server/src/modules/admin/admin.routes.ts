import { Router } from 'express';
import * as adminService from './admin.service.js';
import { authenticateJwt, requirePlatformAdmin, validate } from '../../middleware/index.js';
import { rateLimiter } from '../../middleware/rateLimit.js';
import { hashPassword, generateId } from '../../lib/crypto.js';
import { runDataRetention } from '../../lib/data-retention.js';
import { db } from '../../db/index.js';
import { users, auditLog } from '../../db/schema.js';
import { sql, eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { logEmitter, getRecentLogs, type LogEntry } from './admin-log-stream.js';
import {
  getPlatformDashboardStats,
  getPlatformHourlyCallVolume,
} from '../analytics/analytics.service.js';
import { adminTenantsRouter } from './routes/admin-tenants.routes.js';
import { adminUsersRouter } from './routes/admin-users.routes.js';
import { adminCallsRouter } from './routes/admin-calls.routes.js';
import { adminOpsRouter } from './routes/admin-ops.routes.js';
import { adminPhonePoolRouter } from './routes/admin-phone-pool.routes.js';

export const adminRouter = Router();

// ─── Seed (no auth, dev only) ─────────────────────────────────────────────────

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

// ─── Health (no auth) ─────────────────────────────────────────────────────────

adminRouter.get('/health', async (_req, res, next) => {
  try {
    const health = await adminService.getPlatformHealth();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (err) {
    next(err);
  }
});

// ─── All routes below require platform admin ──────────────────────────────────

adminRouter.use(authenticateJwt, requirePlatformAdmin);

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    res.json(await adminService.getPlatformStats());
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
  validate({ body: z.object({ value: z.string(), description: z.string().optional() }) }),
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

// ─── Audit log ────────────────────────────────────────────────────────────────

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
        conditions.length === 0
          ? undefined
          : conditions.length === 1
            ? conditions[0]
            : and(...conditions);

      const [rows, [{ count }]] = await Promise.all([
        db
          .select()
          .from(auditLog)
          .where(whereClause)
          .orderBy(desc(auditLog.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(auditLog)
          .where(whereClause),
      ]);

      res.json({ data: rows, total: count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Live logs (SSE) ──────────────────────────────────────────────────────────

adminRouter.get('/live-logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const recent = getRecentLogs();
  for (const entry of recent) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  const onLog = (entry: LogEntry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  logEmitter.on('log', onLog);
  req.on('close', () => logEmitter.off('log', onLog));
});

// ─── Analytics ────────────────────────────────────────────────────────────────

adminRouter.get(
  '/analytics/dashboard',
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }) }),
  async (req, res, next) => {
    try {
      const { days } = req.query as unknown as { days: number };
      const endDate = new Date();
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      res.json(await getPlatformDashboardStats({ startDate, endDate }));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get(
  '/analytics/hourly',
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }) }),
  async (req, res, next) => {
    try {
      const { days } = req.query as unknown as { days: number };
      const endDate = new Date();
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      res.json({ data: await getPlatformHourlyCallVolume({ startDate, endDate }) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Sub-routers ──────────────────────────────────────────────────────────────

adminRouter.use('/tenants', adminTenantsRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/calls', adminCallsRouter);
adminRouter.use('/ops', adminOpsRouter);
adminRouter.use('/phone-pool', adminPhonePoolRouter);
