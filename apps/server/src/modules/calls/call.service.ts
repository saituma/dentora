
import { db } from '../../db/index.js';
import {
  callSessions,
  callEvents,
  callCosts,
  callCostLineItems,
  callTranscripts,
} from '../../db/schema.js';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { generateId } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError } from '../../lib/errors.js';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

type CallSession = InferSelectModel<typeof callSessions>;

export async function createCallSession(input: {
  tenantId: string;
  twilioCallSid: string;
  twilioNumberId: string;
  callerNumber: string;
  configVersionId: string;
}): Promise<CallSession> {
  const id = generateId();

  const [session] = await db
    .insert(callSessions)
    .values({
      id,
      tenantId: input.tenantId,
      twilioCallSid: input.twilioCallSid,
      twilioNumberId: input.twilioNumberId,
      callerNumber: input.callerNumber,
      configVersionId: input.configVersionId,
      status: 'started',
    })
    .returning();

  logger.info({ tenantId: input.tenantId, callId: id }, 'Call session created');
  return session;
}

export async function createBrowserTestCallSession(input: {
  tenantId: string;
  configVersionId?: string | null;
}): Promise<CallSession> {
  const id = generateId();

  const [session] = await db
    .insert(callSessions)
    .values({
      id,
      tenantId: input.tenantId,
      configVersionId: input.configVersionId ?? null,
      callerNumber: 'browser-test',
      clinicNumber: 'browser-test',
      status: 'started',
      metadata: {
        source: 'sidebar-test',
      },
    })
    .returning();

  logger.info({ tenantId: input.tenantId, callId: id }, 'Browser test call session created');
  return session;
}

export async function updateCallStatus(
  tenantId: string,
  callId: string,
  status: string,
  metadata?: Record<string, unknown>,
): Promise<CallSession> {
  const updates: Record<string, any> = { status, updatedAt: new Date() };

  if (status === 'completed' || status === 'failed' || status === 'escalated') {
    updates.endedAt = new Date();
  }
  if (metadata?.durationSeconds) {
    updates.durationSeconds = metadata.durationSeconds;
  }
  if (metadata?.endReason) {
    updates.endReason = metadata.endReason;
  }

  const [updated] = await db
    .update(callSessions)
    .set(updates)
    .where(and(eq(callSessions.id, callId), eq(callSessions.tenantId, tenantId)))
    .returning();

  if (!updated) throw new NotFoundError('Call session not found');

  return updated;
}

export async function logCallEvent(input: {
  tenantId: string;
  callSessionId: string;
  eventType: string;
  actor: string;
  payload?: Record<string, unknown>;
  latencyMs?: number;
}): Promise<void> {
  await db.insert(callEvents).values({
    id: generateId(),
    tenantId: input.tenantId,
    callSessionId: input.callSessionId,
    eventType: input.eventType,
    actor: input.actor as any,
    payload: input.payload ?? {},
    latencyMs: input.latencyMs,
  });
}

export async function attributeCallCost(input: {
  tenantId: string;
  callSessionId: string;
  lineItems: Array<{
    provider: string;
    service: string;
    units: number;
    unitCost: string;
    totalCost: string;
    metadata?: Record<string, unknown>;
  }>;
}): Promise<void> {
  const costId = generateId();
  const totalCost = input.lineItems
    .reduce((sum, item) => sum + parseFloat(item.totalCost), 0)
    .toFixed(6);

  await db.transaction(async (tx) => {
    await tx.insert(callCosts).values({
      id: costId,
      tenantId: input.tenantId,
      callSessionId: input.callSessionId,
      totalCost,
      currency: 'USD',
    });

    for (const item of input.lineItems) {
      await tx.insert(callCostLineItems).values({
        id: generateId(),
        tenantId: input.tenantId,
        callSessionId: input.callSessionId,
        callCostId: costId,
        provider: item.provider,
        service: item.service,
        units: item.units,
        unitCost: item.unitCost,
        totalCost: item.totalCost,
        metadata: item.metadata ?? {},
      });
    }
  });

  logger.info({ tenantId: input.tenantId, callSessionId: input.callSessionId, totalCost }, 'Call cost attributed');
}

export async function getCallSession(tenantId: string, callId: string): Promise<CallSession> {
  const [session] = await db
    .select()
    .from(callSessions)
    .where(and(eq(callSessions.id, callId), eq(callSessions.tenantId, tenantId)))
    .limit(1);

  if (!session) throw new NotFoundError('Call session not found');
  return session;
}

export async function listCallSessions(opts: {
  tenantId: string;
  limit: number;
  offset: number;
  startDate?: Date;
  endDate?: Date;
}) {
  let query = db
    .select()
    .from(callSessions)
    .where(eq(callSessions.tenantId, opts.tenantId))
    .orderBy(desc(callSessions.startedAt))
    .limit(opts.limit)
    .offset(opts.offset);

  return await query;
}

export async function getCallEvents(tenantId: string, callSessionId: string) {
  return await db
    .select()
    .from(callEvents)
    .where(and(eq(callEvents.callSessionId, callSessionId), eq(callEvents.tenantId, tenantId)))
    .orderBy(callEvents.timestamp);
}

export async function saveTranscript(input: {
  tenantId: string;
  callSessionId: string;
  fullTranscript: Record<string, unknown>[];
  summary?: string;
  sentiment?: string;
  intentDetected?: string;
}): Promise<void> {
  await db.insert(callTranscripts).values({
    id: generateId(),
    tenantId: input.tenantId,
    callSessionId: input.callSessionId,
    fullTranscript: input.fullTranscript,
    summary: input.summary,
    sentiment: input.sentiment as any,
    intentDetected: input.intentDetected,
  });
}
