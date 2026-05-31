import { Router } from 'express';
import { validate } from '../../../middleware/index.js';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { callSessions, callEvents, callTranscripts, tenantRegistry } from '../../../db/schema.js';
import { sql, eq, and, desc } from 'drizzle-orm';

export const adminCallsRouter = Router();

// ─── List calls ───────────────────────────────────────────────────────────────

adminCallsRouter.get(
  '/',
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
        conditions.length === 0
          ? undefined
          : conditions.length === 1
            ? conditions[0]
            : and(...conditions);

      const [rows, [{ count }]] = await Promise.all([
        db
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
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(callSessions)
          .where(whereClause),
      ]);

      res.json({ data: rows, total: count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get call detail ──────────────────────────────────────────────────────────

adminCallsRouter.get('/:callId', async (req, res, next) => {
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

    const [events, transcripts] = await Promise.all([
      db
        .select()
        .from(callEvents)
        .where(eq(callEvents.callSessionId, callId))
        .orderBy(callEvents.timestamp),
      db.select().from(callTranscripts).where(eq(callTranscripts.callSessionId, callId)),
    ]);

    res.json({ data: { ...callSession, events, transcripts } });
  } catch (err) {
    next(err);
  }
});
