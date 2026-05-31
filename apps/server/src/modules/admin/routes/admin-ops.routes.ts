import { Router } from 'express';
import { validate } from '../../../middleware/index.js';
import { z } from 'zod';
import {
  getOpsDailyCost,
  getOpsCostByProvider,
  getOpsTopTenants,
  getProviderPerformance,
} from '../../analytics/analytics.service.js';
import {
  getCircuitBreakerStatusShared,
  resetCircuitBreaker,
} from '../../../lib/circuit-breaker.js';
import { getQueue, QUEUE_NAMES, type QueueName } from '../../../lib/queue.js';
import { setMute, clearMute, isMuted } from '../../ops-telegram/ops-telegram.service.js';
import * as adminService from '../admin.service.js';

export const adminOpsRouter = Router();

function isQueueName(name: string): name is QueueName {
  return (Object.values(QUEUE_NAMES) as string[]).includes(name);
}

// ─── Cost ─────────────────────────────────────────────────────────────────────

adminOpsRouter.get(
  '/cost',
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) }),
  async (req, res, next) => {
    try {
      const { days } = req.query as unknown as { days: number };
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const [daily, byProvider, topTenants] = await Promise.all([
        getOpsDailyCost(days),
        getOpsCostByProvider(since),
        getOpsTopTenants(since, 10),
      ]);
      const todayKey = startOfToday.toISOString().slice(0, 10);
      const { todayCost, totalCost } = adminService.summarizeDailyCost(daily, todayKey);
      res.json({ daily, byProvider, topTenants, todayCost, totalCost, days });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Circuit breakers ─────────────────────────────────────────────────────────

adminOpsRouter.get('/breakers', async (_req, res, next) => {
  try {
    const breakers = await getCircuitBreakerStatusShared();
    res.json({ breakers });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post('/breakers/:name/reset', async (req, res, next) => {
  try {
    const name = req.params.name as string;
    const existed = await resetCircuitBreaker(name);
    req.audit?.({
      action: 'admin.circuit_breaker_reset',
      entityType: 'circuit_breaker',
      entityId: name,
      afterState: { existed },
    });
    res.json({ message: 'Breaker reset', existed });
  } catch (err) {
    next(err);
  }
});

// ─── Queues ───────────────────────────────────────────────────────────────────

adminOpsRouter.get('/queues', async (_req, res, next) => {
  try {
    const queues = await Promise.all(
      Object.values(QUEUE_NAMES).map(async (name) => {
        try {
          const counts = await getQueue(name).getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
          );
          return {
            name,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            completed: counts.completed ?? 0,
            failed: counts.failed ?? 0,
            delayed: counts.delayed ?? 0,
            available: true,
          };
        } catch {
          return {
            name,
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            available: false,
          };
        }
      }),
    );
    res.json({ queues });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post(
  '/queues/:name/retry',
  validate({ body: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }) }),
  async (req, res, next) => {
    try {
      const name = req.params.name as string;
      if (!isQueueName(name)) {
        res.status(400).json({ error: 'Unknown queue' });
        return;
      }
      const { limit } = req.body as { limit: number };
      const jobs = await getQueue(name).getFailed(0, limit - 1);
      let retried = 0;
      for (const job of jobs) {
        await job.retry();
        retried++;
      }
      req.audit?.({
        action: 'admin.queue_jobs_retried',
        entityType: 'queue',
        entityId: name,
        afterState: { retried },
      });
      res.json({ message: 'Failed jobs retried', retried });
    } catch (err) {
      next(err);
    }
  },
);

adminOpsRouter.post(
  '/queues/:name/clean',
  validate({ body: z.object({ status: z.enum(['failed', 'completed']).default('failed') }) }),
  async (req, res, next) => {
    try {
      const name = req.params.name as string;
      if (!isQueueName(name)) {
        res.status(400).json({ error: 'Unknown queue' });
        return;
      }
      const { status } = req.body as { status: 'failed' | 'completed' };
      const removed = await getQueue(name).clean(0, 5000, status);
      req.audit?.({
        action: 'admin.queue_cleaned',
        entityType: 'queue',
        entityId: name,
        afterState: { status, removed: removed.length },
      });
      res.json({ message: 'Queue cleaned', removed: removed.length });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Providers ────────────────────────────────────────────────────────────────

adminOpsRouter.get('/providers', async (_req, res, next) => {
  try {
    const endDate = new Date();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const providers = await getProviderPerformance({ startDate, endDate });
    res.json({ providers });
  } catch (err) {
    next(err);
  }
});

// ─── Alerts mute ─────────────────────────────────────────────────────────────

adminOpsRouter.get('/alerts/mute', async (_req, res, next) => {
  try {
    res.json({ muted: isMuted() });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post(
  '/alerts/mute',
  validate({ body: z.object({ minutes: z.coerce.number().int().min(0).max(1440) }) }),
  async (req, res, next) => {
    try {
      const { minutes } = req.body as { minutes: number };
      if (minutes === 0) {
        clearMute();
      } else {
        setMute(minutes);
      }
      req.audit?.({
        action: 'admin.ops_alerts_muted',
        entityType: 'ops_alerts',
        afterState: { minutes },
      });
      res.json({ message: minutes === 0 ? 'Alerts unmuted' : 'Alerts muted', muted: isMuted() });
    } catch (err) {
      next(err);
    }
  },
);
