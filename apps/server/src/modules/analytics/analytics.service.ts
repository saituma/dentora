
import { db } from '../../db/index.js';
import { callSessions, callEvents, callCosts, callTranscripts } from '../../db/schema.js';
import { eq, and, gte, lte, sql, desc, count } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export interface DashboardStats {
  totalCalls: number;
  averageDurationSeconds: number;
  completionRate: number;
  totalCost: string;
  sentimentBreakdown: Record<string, number>;
  topIntents: Array<{ intent: string; count: number }>;
  callsByStatus: Record<string, number>;
  averageLatencyMs: number;
}

export async function getDashboardStats(input: {
  tenantId: string;
  startDate: Date;
  endDate: Date;
}): Promise<DashboardStats> {
  const { tenantId, startDate, endDate } = input;

  const [callStats] = await db
    .select({
      totalCalls: sql<number>`COUNT(*)::int`,
      avgDuration: sql<number>`COALESCE(AVG(${callSessions.durationSeconds}), 0)::int`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${callSessions.status} = 'completed')::int`,
    })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.tenantId, tenantId),
        gte(callSessions.startedAt, startDate),
        lte(callSessions.startedAt, endDate),
      ),
    );

  const [costStats] = await db
    .select({
      totalCost: sql<string>`COALESCE(SUM(${callCosts.totalCost}::numeric), 0)::text`,
    })
    .from(callCosts)
    .where(
      and(
        eq(callCosts.tenantId, tenantId),
        gte(callCosts.createdAt, startDate),
        lte(callCosts.createdAt, endDate),
      ),
    );

  const statusBreakdown = await db
    .select({
      status: callSessions.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.tenantId, tenantId),
        gte(callSessions.startedAt, startDate),
        lte(callSessions.startedAt, endDate),
      ),
    )
    .groupBy(callSessions.status);

  const callsByStatus: Record<string, number> = {};
  for (const row of statusBreakdown) {
    callsByStatus[row.status] = row.count;
  }

  const sentimentRows = await db
    .select({
      sentiment: callTranscripts.sentiment,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(callTranscripts)
    .where(eq(callTranscripts.tenantId, tenantId))
    .groupBy(callTranscripts.sentiment);

  const sentimentBreakdown: Record<string, number> = {};
  for (const row of sentimentRows) {
    if (row.sentiment) sentimentBreakdown[row.sentiment] = row.count;
  }

  const intentRows = await db
    .select({
      intent: callTranscripts.intentDetected,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(callTranscripts)
    .where(
      and(
        eq(callTranscripts.tenantId, tenantId),
        sql`${callTranscripts.intentDetected} IS NOT NULL`,
      ),
    )
    .groupBy(callTranscripts.intentDetected)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

  const topIntents = intentRows.map((r) => ({
    intent: r.intent!,
    count: r.count,
  }));

  const [latencyStats] = await db
    .select({
      avgLatency: sql<number>`COALESCE(AVG(${callEvents.latencyMs}), 0)::int`,
    })
    .from(callEvents)
    .where(
      and(
        eq(callEvents.tenantId, tenantId),
        sql`${callEvents.latencyMs} IS NOT NULL`,
      ),
    );

  const completionRate = callStats.totalCalls > 0
    ? (callStats.completed / callStats.totalCalls) * 100
    : 0;

  return {
    totalCalls: callStats.totalCalls,
    averageDurationSeconds: callStats.avgDuration,
    completionRate: Math.round(completionRate * 100) / 100,
    totalCost: costStats.totalCost,
    sentimentBreakdown,
    topIntents,
    callsByStatus,
    averageLatencyMs: latencyStats.avgLatency,
  };
}

export async function getHourlyCallVolume(input: {
  tenantId: string;
  startDate: Date;
  endDate: Date;
}): Promise<Array<{ hour: string; calls: number }>> {
  const results = await db
    .select({
      hour: sql<string>`DATE_TRUNC('hour', ${callSessions.startedAt})::text`,
      calls: sql<number>`COUNT(*)::int`,
    })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.tenantId, input.tenantId),
        gte(callSessions.startedAt, input.startDate),
        lte(callSessions.startedAt, input.endDate),
      ),
    )
    .groupBy(sql`DATE_TRUNC('hour', ${callSessions.startedAt})`)
    .orderBy(sql`DATE_TRUNC('hour', ${callSessions.startedAt})`);

  return results;
}

export async function getProviderPerformance(input: {
  startDate: Date;
  endDate: Date;
}): Promise<Array<{ provider: string; avgLatencyMs: number; totalCalls: number; failureRate: number }>> {
  const results = await db
    .select({
      provider: sql<string>`${callEvents.payload}->>'provider'`,
      avgLatencyMs: sql<number>`AVG(${callEvents.latencyMs})::int`,
      totalCalls: sql<number>`COUNT(DISTINCT ${callEvents.callSessionId})::int`,
    })
    .from(callEvents)
    .where(
      and(
        eq(callEvents.eventType, 'llm_response'),
        sql`${callEvents.latencyMs} IS NOT NULL`,
      ),
    )
    .groupBy(sql`${callEvents.payload}->>'provider'`);

  return results.map((r) => ({
    provider: r.provider ?? 'unknown',
    avgLatencyMs: r.avgLatencyMs,
    totalCalls: r.totalCalls,
    failureRate: 0,
  }));
}
