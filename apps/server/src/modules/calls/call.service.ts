
import { db } from '../../db/index.js';
import {
  callSessions,
  callEvents,
  callCosts,
  callCostLineItems,
  callTranscripts,
} from '../../db/schema.js';
import { eq, and, desc, ilike, or } from 'drizzle-orm';
import { generateId } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError } from '../../lib/errors.js';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { executeLlmWithFailover } from '../ai/engine/index.js';
import type { LlmMessage } from '../ai/providers/base.js';

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

export async function updateCallCallerNumber(
  tenantId: string,
  callId: string,
  callerNumber: string,
): Promise<void> {
  const normalized = callerNumber.trim();
  if (!normalized) return;
  await db
    .update(callSessions)
    .set({ callerNumber: normalized, updatedAt: new Date() })
    .where(and(eq(callSessions.id, callId), eq(callSessions.tenantId, tenantId)));
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

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export async function listCallSessionsByCaller(input: {
  tenantId: string;
  phoneNumber: string;
  limit?: number;
}): Promise<Array<CallSession & { transcriptSummary: string | null; intentDetected: string | null }>> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const rawPhone = input.phoneNumber.trim();
  const digits = normalizePhoneDigits(rawPhone);
  const likePattern = digits.length >= 7 ? `%${digits.slice(-7)}%` : `%${digits}%`;

  const calls = await db
    .select()
    .from(callSessions)
    .where(and(
      eq(callSessions.tenantId, input.tenantId),
      or(
        eq(callSessions.callerNumber, rawPhone),
        ilike(callSessions.callerNumber, likePattern),
      )!,
    ))
    .orderBy(desc(callSessions.startedAt))
    .limit(limit);

  const summaries = await Promise.all(calls.map(async (call) => {
    const transcript = await getCallTranscript(input.tenantId, call.id);
    return {
      callId: call.id,
      summary: transcript?.summary ?? null,
      intentDetected: transcript?.intentDetected ?? null,
    };
  }));

  const summaryMap = new Map(summaries.map((entry) => [entry.callId, entry]));

  return calls.map((call) => {
    const summary = summaryMap.get(call.id);
    return {
      ...call,
      transcriptSummary: summary?.summary ?? null,
      intentDetected: summary?.intentDetected ?? null,
    };
  });
}

export async function getCallEvents(tenantId: string, callSessionId: string) {
  return await db
    .select()
    .from(callEvents)
    .where(and(eq(callEvents.callSessionId, callSessionId), eq(callEvents.tenantId, tenantId)))
    .orderBy(callEvents.timestamp);
}

export async function getCallTranscript(
  tenantId: string,
  callSessionId: string,
) {
  const [transcript] = await db
    .select()
    .from(callTranscripts)
    .where(and(eq(callTranscripts.callSessionId, callSessionId), eq(callTranscripts.tenantId, tenantId)))
    .orderBy(desc(callTranscripts.createdAt))
    .limit(1);

  return transcript ?? null;
}

export async function getCallCostBreakdown(
  tenantId: string,
  callSessionId: string,
) {
  const [cost] = await db
    .select()
    .from(callCosts)
    .where(and(eq(callCosts.callSessionId, callSessionId), eq(callCosts.tenantId, tenantId)))
    .orderBy(desc(callCosts.createdAt))
    .limit(1);

  if (!cost) return null;

  const lineItems = await db
    .select()
    .from(callCostLineItems)
    .where(
      and(
        eq(callCostLineItems.callCostId, cost.id),
        eq(callCostLineItems.tenantId, tenantId),
      ),
    )
    .orderBy(desc(callCostLineItems.createdAt));

  return { ...cost, lineItems };
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

function formatTranscriptForSummary(turns: Array<{ role?: string; content?: string; text?: string }>): string {
  const lines = turns
    .map((turn) => {
      const role = (turn.role ?? 'unknown').toString().trim();
      const content = (turn.content ?? turn.text ?? '').toString().trim();
      if (!content) return '';
      const label = role === 'assistant' ? 'Assistant' : role === 'user' ? 'Caller' : role;
      return `${label}: ${content}`;
    })
    .filter(Boolean);

  if (lines.length === 0) return '';

  const MAX_LINES = 60;
  const trimmedLines = lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines;
  let transcript = trimmedLines.join('\n');

  const MAX_CHARS = 6000;
  if (transcript.length > MAX_CHARS) {
    transcript = transcript.slice(transcript.length - MAX_CHARS);
  }

  return transcript;
}

export async function generateCallSummary(input: {
  tenantId: string;
  callSessionId: string;
  transcriptTurns: Array<{ role?: string; content?: string; text?: string }>;
}): Promise<string | null> {
  const formattedTranscript = formatTranscriptForSummary(input.transcriptTurns);
  if (!formattedTranscript) return null;

  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: [
        'You summarize dental receptionist phone calls.',
        'Write a concise 2-4 sentence summary.',
        'Include caller intent, key details (symptoms, timing, requested services),',
        'actions taken, and outcome if known.',
        'Do not invent details. If a detail is missing, omit it.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Transcript:\n${formattedTranscript}\n\nSummary:`,
    },
  ];

  try {
    const result = await executeLlmWithFailover({
      workloadType: 'llm',
      tenantId: input.tenantId,
      maxLatencyMs: 8000,
      minReliability: 0.8,
      llmRequest: {
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.2,
        maxTokens: 220,
        tenantId: input.tenantId,
        callSessionId: input.callSessionId,
      },
    });

    const summary = result.content.trim();
    return summary.length > 0 ? summary : null;
  } catch (error) {
    logger.warn(
      { err: error, callSessionId: input.callSessionId, tenantId: input.tenantId },
      'Failed to generate call summary with LLM',
    );
    return null;
  }
}
