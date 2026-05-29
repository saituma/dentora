import { db } from '../../db/index.js';
import {
  callSessions,
  callEvents,
  callCosts,
  callCostLineItems,
  callTranscripts,
  appointments,
  tenantRegistry,
} from '../../db/schema.js';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { tenantCacheGet, tenantCacheSet } from '../../lib/cache.js';

export interface DashboardStats {
  totalCalls: number;
  averageDurationSeconds: number;
  completionRate: number;
  bookingRate: number;
  bookedCalls: number;
  hangupCount: number;
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

  const cacheSlot = Math.floor(Date.now() / 300_000);
  const cacheId = `dashboard:${startDate.toISOString()}:${endDate.toISOString()}:${cacheSlot}`;
  const cached = await tenantCacheGet<DashboardStats>(tenantId, 'analytics', cacheId);
  if (cached) return cached;

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
    .where(and(eq(callEvents.tenantId, tenantId), sql`${callEvents.latencyMs} IS NOT NULL`));

  // Calls that resulted in an actual appointment booking
  const [bookingStats] = await db
    .select({
      bookedCalls: sql<number>`COUNT(DISTINCT ${appointments.callSessionId})::int`,
    })
    .from(appointments)
    .innerJoin(callSessions, eq(appointments.callSessionId, callSessions.id))
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        gte(callSessions.startedAt, startDate),
        lte(callSessions.startedAt, endDate),
      ),
    );

  // Calls where the caller hung up (incomplete conversations)
  const [hangupStats] = await db
    .select({
      hangupCount: sql<number>`COUNT(*)::int`,
    })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.tenantId, tenantId),
        gte(callSessions.startedAt, startDate),
        lte(callSessions.startedAt, endDate),
        eq(callSessions.endReason, 'caller_hangup'),
      ),
    );

  const completionRate =
    callStats.totalCalls > 0 ? (callStats.completed / callStats.totalCalls) * 100 : 0;

  const bookedCalls = bookingStats.bookedCalls ?? 0;
  const bookingRate = callStats.totalCalls > 0 ? (bookedCalls / callStats.totalCalls) * 100 : 0;

  const result: DashboardStats = {
    totalCalls: callStats.totalCalls,
    averageDurationSeconds: callStats.avgDuration,
    completionRate: Math.round(completionRate * 100) / 100,
    bookingRate: Math.round(bookingRate * 100) / 100,
    bookedCalls,
    hangupCount: hangupStats.hangupCount ?? 0,
    totalCost: costStats.totalCost,
    sentimentBreakdown,
    topIntents,
    callsByStatus,
    averageLatencyMs: latencyStats.avgLatency,
  };

  await tenantCacheSet(tenantId, 'analytics', cacheId, result, 300);
  return result;
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

export async function getProviderPerformance(_input: {
  startDate: Date;
  endDate: Date;
}): Promise<
  Array<{ provider: string; avgLatencyMs: number; totalCalls: number; failureRate: number }>
> {
  const results = await db
    .select({
      provider: sql<string>`${callEvents.payload}->>'provider'`,
      avgLatencyMs: sql<number>`AVG(${callEvents.latencyMs})::int`,
      totalCalls: sql<number>`COUNT(DISTINCT ${callEvents.callSessionId})::int`,
    })
    .from(callEvents)
    .where(and(eq(callEvents.eventType, 'llm_response'), sql`${callEvents.latencyMs} IS NOT NULL`))
    .groupBy(sql`${callEvents.payload}->>'provider'`);

  return results.map((r) => ({
    provider: r.provider ?? 'unknown',
    avgLatencyMs: r.avgLatencyMs,
    totalCalls: r.totalCalls,
    failureRate: 0,
  }));
}

// ── Global ops queries (cross-tenant; for the ops bot, not tenant dashboards) ──

/** Total spend per day for the last N days, across all tenants. */
export async function getOpsDailyCost(days: number): Promise<Array<{ day: string; cost: number }>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`TO_CHAR(DATE_TRUNC('day', ${callCosts.createdAt}), 'YYYY-MM-DD')`,
      cost: sql<number>`COALESCE(SUM(${callCosts.totalCost}::numeric), 0)::float8`,
    })
    .from(callCosts)
    .where(gte(callCosts.createdAt, since))
    .groupBy(sql`DATE_TRUNC('day', ${callCosts.createdAt})`)
    .orderBy(sql`DATE_TRUNC('day', ${callCosts.createdAt})`);
  return rows.map((r) => ({ day: r.day, cost: Number(r.cost) }));
}

/** Spend grouped by provider since a given time, across all tenants. */
export async function getOpsCostByProvider(
  since: Date,
): Promise<Array<{ provider: string; cost: number }>> {
  const rows = await db
    .select({
      provider: callCostLineItems.provider,
      cost: sql<number>`COALESCE(SUM(${callCostLineItems.totalCost}::numeric), 0)::float8`,
    })
    .from(callCostLineItems)
    .where(gte(callCostLineItems.createdAt, since))
    .groupBy(callCostLineItems.provider)
    .orderBy(desc(sql`SUM(${callCostLineItems.totalCost}::numeric)`));
  return rows.map((r) => ({ provider: r.provider, cost: Number(r.cost) }));
}

/**
 * Platform-wide dashboard stats (cross-tenant) for the admin portal.
 * Mirrors getDashboardStats but omits the tenant filter; gated by
 * requirePlatformAdmin at the route layer. Not cached (admin traffic is low).
 */
export async function getPlatformDashboardStats(input: {
  startDate: Date;
  endDate: Date;
}): Promise<DashboardStats> {
  const { startDate, endDate } = input;
  const range = and(gte(callSessions.startedAt, startDate), lte(callSessions.startedAt, endDate));

  const [callStats] = await db
    .select({
      totalCalls: sql<number>`COUNT(*)::int`,
      avgDuration: sql<number>`COALESCE(AVG(${callSessions.durationSeconds}), 0)::int`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${callSessions.status} = 'completed')::int`,
    })
    .from(callSessions)
    .where(range);

  const [costStats] = await db
    .select({
      totalCost: sql<string>`COALESCE(SUM(${callCosts.totalCost}::numeric), 0)::text`,
    })
    .from(callCosts)
    .where(and(gte(callCosts.createdAt, startDate), lte(callCosts.createdAt, endDate)));

  const statusBreakdown = await db
    .select({ status: callSessions.status, count: sql<number>`COUNT(*)::int` })
    .from(callSessions)
    .where(range)
    .groupBy(callSessions.status);

  const callsByStatus: Record<string, number> = {};
  for (const row of statusBreakdown) callsByStatus[row.status] = row.count;

  const sentimentRows = await db
    .select({ sentiment: callTranscripts.sentiment, count: sql<number>`COUNT(*)::int` })
    .from(callTranscripts)
    .groupBy(callTranscripts.sentiment);

  const sentimentBreakdown: Record<string, number> = {};
  for (const row of sentimentRows) {
    if (row.sentiment) sentimentBreakdown[row.sentiment] = row.count;
  }

  const intentRows = await db
    .select({ intent: callTranscripts.intentDetected, count: sql<number>`COUNT(*)::int` })
    .from(callTranscripts)
    .where(sql`${callTranscripts.intentDetected} IS NOT NULL`)
    .groupBy(callTranscripts.intentDetected)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

  const topIntents = intentRows.map((r) => ({ intent: r.intent!, count: r.count }));

  const [latencyStats] = await db
    .select({ avgLatency: sql<number>`COALESCE(AVG(${callEvents.latencyMs}), 0)::int` })
    .from(callEvents)
    .where(sql`${callEvents.latencyMs} IS NOT NULL`);

  const [bookingStats] = await db
    .select({ bookedCalls: sql<number>`COUNT(DISTINCT ${appointments.callSessionId})::int` })
    .from(appointments)
    .innerJoin(callSessions, eq(appointments.callSessionId, callSessions.id))
    .where(range);

  const [hangupStats] = await db
    .select({ hangupCount: sql<number>`COUNT(*)::int` })
    .from(callSessions)
    .where(and(range, eq(callSessions.endReason, 'caller_hangup')));

  const completionRate =
    callStats.totalCalls > 0 ? (callStats.completed / callStats.totalCalls) * 100 : 0;
  const bookedCalls = bookingStats.bookedCalls ?? 0;
  const bookingRate = callStats.totalCalls > 0 ? (bookedCalls / callStats.totalCalls) * 100 : 0;

  return {
    totalCalls: callStats.totalCalls,
    averageDurationSeconds: callStats.avgDuration,
    completionRate: Math.round(completionRate * 100) / 100,
    bookingRate: Math.round(bookingRate * 100) / 100,
    bookedCalls,
    hangupCount: hangupStats.hangupCount ?? 0,
    totalCost: costStats.totalCost,
    sentimentBreakdown,
    topIntents,
    callsByStatus,
    averageLatencyMs: latencyStats.avgLatency,
  };
}

/** Platform-wide hourly call volume (cross-tenant) for the admin portal. */
export async function getPlatformHourlyCallVolume(input: {
  startDate: Date;
  endDate: Date;
}): Promise<Array<{ hour: string; calls: number }>> {
  return db
    .select({
      hour: sql<string>`DATE_TRUNC('hour', ${callSessions.startedAt})::text`,
      calls: sql<number>`COUNT(*)::int`,
    })
    .from(callSessions)
    .where(
      and(gte(callSessions.startedAt, input.startDate), lte(callSessions.startedAt, input.endDate)),
    )
    .groupBy(sql`DATE_TRUNC('hour', ${callSessions.startedAt})`)
    .orderBy(sql`DATE_TRUNC('hour', ${callSessions.startedAt})`);
}

/** Busiest clinics by call volume since a given time, with their spend. */
export async function getOpsTopTenants(
  since: Date,
  limit: number,
): Promise<Array<{ clinicName: string; calls: number; cost: number }>> {
  const rows = await db
    .select({
      clinicName: tenantRegistry.clinicName,
      calls: sql<number>`COUNT(${callSessions.id})::int`,
      cost: sql<number>`COALESCE(SUM(${callCosts.totalCost}::numeric), 0)::float8`,
    })
    .from(callSessions)
    .innerJoin(tenantRegistry, eq(tenantRegistry.id, callSessions.tenantId))
    .leftJoin(callCosts, eq(callCosts.callSessionId, callSessions.id))
    .where(gte(callSessions.startedAt, since))
    .groupBy(tenantRegistry.clinicName)
    .orderBy(desc(sql`COUNT(${callSessions.id})`))
    .limit(limit);
  return rows.map((r) => ({ clinicName: r.clinicName, calls: r.calls, cost: Number(r.cost) }));
}
