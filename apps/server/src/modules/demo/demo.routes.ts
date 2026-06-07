import { Router } from 'express';
import { z } from 'zod';
import { desc, sql } from 'drizzle-orm';
import { validate } from '../../middleware/validate.js';
import { authenticateJwt, requirePlatformAdmin } from '../../middleware/index.js';
import { rateLimiter } from '../../middleware/rateLimit.js';
import { db } from '../../db/index.js';
import { demoRequests } from '../../db/schema.js';

export const demoRouter = Router();

const demoSubmitLimiter = rateLimiter({
  maxRequests: 5,
  windowSeconds: 60,
  keyPrefix: 'demo-request',
  keyExtractor: (req) => req.ip || 'unknown',
});

const createDemoRequestSchema = z.object({
  fullName: z.string().min(2).max(200),
  email: z
    .string()
    .max(320)
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Invalid email'),
  phoneE164: z.string().min(8).max(20),
  phoneCountry: z.string().length(2),
  message: z.string().min(5).max(2000),
  source: z.string().max(100),
});

// Public — no auth
demoRouter.post(
  '/',
  demoSubmitLimiter,
  validate({ body: createDemoRequestSchema }),
  async (req, res, next) => {
    try {
      const [row] = await db
        .insert(demoRequests)
        .values({
          fullName: req.body.fullName,
          email: req.body.email,
          phoneE164: req.body.phoneE164,
          phoneCountry: req.body.phoneCountry,
          message: req.body.message,
          source: req.body.source,
        })
        .returning({ id: demoRequests.id, createdAt: demoRequests.createdAt });

      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

// Admin — list demo requests
const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  search: z.string().optional(),
});

demoRouter.get(
  '/',
  authenticateJwt,
  requirePlatformAdmin,
  validate({ query: listQuerySchema }),
  async (req, res, next) => {
    try {
      const { limit, offset, search } = req.query as unknown as z.infer<typeof listQuerySchema>;

      const where = search
        ? sql`(${demoRequests.fullName} ILIKE ${'%' + search + '%'} OR ${demoRequests.email} ILIKE ${'%' + search + '%'})`
        : undefined;

      const [rows, [{ count }]] = await Promise.all([
        db
          .select()
          .from(demoRequests)
          .where(where)
          .orderBy(desc(demoRequests.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(demoRequests)
          .where(where),
      ]);

      res.json({ data: rows, total: count });
    } catch (err) {
      next(err);
    }
  },
);
