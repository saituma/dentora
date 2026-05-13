import { db } from '../../db/index.js';
import {
  callSessions,
  callEvents,
  callCosts,
  callCostLineItems,
  callTranscripts,
} from '../../db/schema.js';
import { eq, and, desc, inArray, lt, or } from 'drizzle-orm';
import { generateId } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { encryptField, decryptField, hashForSearch } from '../../lib/encrypted-column.js';
import { NotFoundError } from '../../lib/errors.js';
import type { InferSelectModel } from 'drizzle-orm';
import { executeLlmWithFailover } from '../ai/engine/index.js';
import type { LlmMessage } from '../ai/providers/base.js';
import { assertTenantAccess } from '../../db/tenant-context.js';
import { redactLogValue } from '../../lib/log-redaction.js';

type CallSession = InferSelectModel<typeof callSessions>;
type TranscriptTurn = Record<string, unknown>;
type EncryptedTranscriptEnvelope = {
  encrypted: true;
  ciphertext: string;
};

function decryptCallSession(s: CallSession): CallSession {
  return {
    ...s,
    callerNumber: decryptField(s.callerNumber),
    intentSummary: decryptField(s.intentSummary),
  };
}

function sanitizeEventPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!payload) return {};
  return redactLogValue(payload) as Record<string, unknown>;
}

function encryptTranscript(turns: TranscriptTurn[]): EncryptedTranscriptEnvelope {
  const ciphertext = encryptField(JSON.stringify(turns));
  if (!ciphertext) {
    throw new Error('Failed to encrypt transcript');
  }
  return { encrypted: true, ciphertext };
}

function isEncryptedTranscriptEnvelope(value: unknown): value is EncryptedTranscriptEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'encrypted' in value &&
    'ciphertext' in value &&
    (value as { encrypted?: unknown }).encrypted === true &&
    typeof (value as { ciphertext?: unknown }).ciphertext === 'string'
  );
}

function decryptTranscript(value: unknown): TranscriptTurn[] {
  if (!isEncryptedTranscriptEnvelope(value)) {
    return Array.isArray(value) ? (value as TranscriptTurn[]) : [];
  }

  const decrypted = decryptField(value.ciphertext);
  if (!decrypted) return [];
  const parsed = JSON.parse(decrypted) as unknown;
  return Array.isArray(parsed) ? (parsed as TranscriptTurn[]) : [];
}

export async function createCallSession(input: {
  tenantId: string;
  twilioCallSid: string;
  twilioNumberId: string;
  callerNumber: string;
  configVersionId: string;
}): Promise<CallSession> {
  assertTenantAccess(input.tenantId);
  const id = generateId();

  const plainCaller = input.callerNumber.trim();
  const [session] = await db
    .insert(callSessions)
    .values({
      id,
      tenantId: input.tenantId,
      twilioCallSid: input.twilioCallSid,
      twilioNumberId: input.twilioNumberId,
      callerNumber: encryptField(plainCaller),
      callerNumberHash: hashForSearch(plainCaller),
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
  assertTenantAccess(input.tenantId);
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
  assertTenantAccess(tenantId);
  const updates: Record<string, unknown> = { status, updatedAt: new Date() };

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
  assertTenantAccess(tenantId);
  const normalized = callerNumber.trim();
  if (!normalized) return;
  await db
    .update(callSessions)
    .set({
      callerNumber: encryptField(normalized),
      callerNumberHash: hashForSearch(normalized),
      updatedAt: new Date(),
    })
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
  assertTenantAccess(input.tenantId);
  await db.insert(callEvents).values({
    id: generateId(),
    tenantId: input.tenantId,
    callSessionId: input.callSessionId,
    eventType: input.eventType,
    actor: input.actor,
    payload: sanitizeEventPayload(input.payload),
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
  assertTenantAccess(input.tenantId);
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

  logger.info(
    { tenantId: input.tenantId, callSessionId: input.callSessionId, totalCost },
    'Call cost attributed',
  );
}

export async function getCallSession(tenantId: string, callId: string): Promise<CallSession> {
  assertTenantAccess(tenantId);
  const [session] = await db
    .select()
    .from(callSessions)
    .where(and(eq(callSessions.id, callId), eq(callSessions.tenantId, tenantId)))
    .limit(1);

  if (!session) throw new NotFoundError('Call session not found');
  return decryptCallSession(session);
}

// Cursor = base64(JSON.stringify({ at: ISO_DATE, id: UUID })) — opaque to callers.
function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      at: string;
      id: string;
    };
    return { at: new Date(parsed.at), id: parsed.id };
  } catch {
    return null;
  }
}

export async function listCallSessions(opts: {
  tenantId: string;
  limit: number;
  cursor?: string;
  /** @deprecated use cursor instead */
  offset?: number;
}) {
  assertTenantAccess(opts.tenantId);
  const limit = Math.min(opts.limit, 100);
  const cursorData = opts.cursor ? decodeCursor(opts.cursor) : null;

  const baseWhere = eq(callSessions.tenantId, opts.tenantId);
  const cursorWhere = cursorData
    ? or(
        lt(callSessions.startedAt, cursorData.at),
        and(eq(callSessions.startedAt, cursorData.at), lt(callSessions.id, cursorData.id)),
      )
    : undefined;

  const rows = await db
    .select()
    .from(callSessions)
    .where(cursorWhere ? and(baseWhere, cursorWhere) : baseWhere)
    .orderBy(desc(callSessions.startedAt), desc(callSessions.id))
    .limit(limit + 1) // fetch one extra to know if there's a next page
    .offset(!cursorData && opts.offset ? opts.offset : 0);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  const nextCursor = hasMore && last ? encodeCursor(last.startedAt, last.id) : undefined;

  return { items: items.map(decryptCallSession), nextCursor, hasMore };
}

export async function listCallSessionsByCaller(input: {
  tenantId: string;
  phoneNumber: string;
  limit?: number;
}): Promise<
  Array<CallSession & { transcriptSummary: string | null; intentDetected: string | null }>
> {
  assertTenantAccess(input.tenantId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const phoneHash = hashForSearch(input.phoneNumber);

  const calls = await db
    .select()
    .from(callSessions)
    .where(
      and(eq(callSessions.tenantId, input.tenantId), eq(callSessions.callerNumberHash, phoneHash)),
    )
    .orderBy(desc(callSessions.startedAt))
    .limit(limit);

  const callIds = calls.map((c) => c.id);
  const transcripts =
    callIds.length > 0
      ? await db
          .select()
          .from(callTranscripts)
          .where(
            and(
              eq(callTranscripts.tenantId, input.tenantId),
              inArray(callTranscripts.callSessionId, callIds),
            ),
          )
      : [];
  const summaryMap = new Map(transcripts.map((t) => [t.callSessionId, t]));

  return calls.map((call) => {
    const t = summaryMap.get(call.id);
    return {
      ...decryptCallSession(call),
      transcriptSummary: decryptField(t?.summary) ?? null,
      intentDetected: t?.intentDetected ?? null,
    };
  });
}

export async function getCallEvents(
  tenantId: string,
  callSessionId: string,
  limit = 200,
  offset = 0,
) {
  assertTenantAccess(tenantId);
  return await db
    .select()
    .from(callEvents)
    .where(and(eq(callEvents.callSessionId, callSessionId), eq(callEvents.tenantId, tenantId)))
    .orderBy(callEvents.timestamp)
    .limit(limit)
    .offset(offset);
}

export async function getCallTranscript(tenantId: string, callSessionId: string) {
  assertTenantAccess(tenantId);
  const [transcript] = await db
    .select()
    .from(callTranscripts)
    .where(
      and(eq(callTranscripts.callSessionId, callSessionId), eq(callTranscripts.tenantId, tenantId)),
    )
    .orderBy(desc(callTranscripts.createdAt))
    .limit(1);

  if (!transcript) return null;
  return {
    ...transcript,
    fullTranscript: decryptTranscript(transcript.fullTranscript),
    summary: decryptField(transcript.summary),
  };
}

export async function getCallCostBreakdown(tenantId: string, callSessionId: string) {
  assertTenantAccess(tenantId);
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
    .where(and(eq(callCostLineItems.callCostId, cost.id), eq(callCostLineItems.tenantId, tenantId)))
    .orderBy(desc(callCostLineItems.createdAt));

  return { ...cost, lineItems };
}

export async function saveTranscript(input: {
  tenantId: string;
  callSessionId: string;
  fullTranscript: TranscriptTurn[];
  summary?: string;
  sentiment?: string;
  intentDetected?: string;
}): Promise<void> {
  assertTenantAccess(input.tenantId);
  await db.insert(callTranscripts).values({
    id: generateId(),
    tenantId: input.tenantId,
    callSessionId: input.callSessionId,
    fullTranscript: encryptTranscript(input.fullTranscript),
    summary: encryptField(input.summary ?? null),
    sentiment: input.sentiment,
    intentDetected: input.intentDetected,
  });
}

function formatTranscriptForSummary(
  turns: Array<{ role?: string; content?: string; text?: string }>,
): string {
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
  assertTenantAccess(input.tenantId);
  const formattedTranscript = formatTranscriptForSummary(input.transcriptTurns);
  if (!formattedTranscript) return null;

  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: [
        'You summarize dental receptionist phone calls and analyze caller sentiment.',
        'Respond in JSON with two fields: "summary" (2-4 sentence summary including caller intent,',
        'key details, actions taken, and outcome) and "sentiment" (one of: "positive", "neutral", "negative", "frustrated").',
        'Also include "intent" (one of: "booking", "cancellation", "reschedule", "inquiry", "emergency", "complaint", "other").',
        'Do not invent details. If a detail is missing, omit it from the summary.',
        'Respond ONLY with valid JSON, no markdown.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Transcript:\n${formattedTranscript}\n\nJSON:`,
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

    const raw = result.content.trim();
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as { summary?: string; sentiment?: string; intent?: string };
      if (parsed.summary) {
        if (parsed.sentiment || parsed.intent) {
          await db
            .update(callTranscripts)
            .set({
              sentiment: parsed.sentiment ?? null,
              intentDetected: parsed.intent ?? null,
            })
            .where(
              and(
                eq(callTranscripts.callSessionId, input.callSessionId),
                eq(callTranscripts.tenantId, input.tenantId),
              ),
            );
        }
        return parsed.summary;
      }
    } catch {
      // LLM returned plain text instead of JSON
    }

    return raw;
  } catch (error) {
    logger.warn(
      { err: error, callSessionId: input.callSessionId, tenantId: input.tenantId },
      'Failed to generate call summary with LLM',
    );
    return null;
  }
}
