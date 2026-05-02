
import { db } from '../../db/index.js';
import { callCosts, callCostLineItems, callSessions, tenantRegistry } from '../../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export async function getTenantBillingSummary(input: {
  tenantId: string;
  startDate: Date;
  endDate: Date;
}): Promise<{
  totalCost: string;
  totalCalls: number;
  costBreakdown: Record<string, string>;
  period: { start: string; end: string };
}> {
  const [costResult] = await db
    .select({
      totalCost: sql<string>`COALESCE(SUM(${callCosts.totalCost}::numeric), 0)::text`,
    })
    .from(callCosts)
    .where(
      and(
        eq(callCosts.tenantId, input.tenantId),
        gte(callCosts.createdAt, input.startDate),
        lte(callCosts.createdAt, input.endDate),
      ),
    );

  const [callResult] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.tenantId, input.tenantId),
        gte(callSessions.startedAt, input.startDate),
        lte(callSessions.startedAt, input.endDate),
      ),
    );

  const breakdown = await db
    .select({
      service: callCostLineItems.service,
      total: sql<string>`SUM(${callCostLineItems.totalCost}::numeric)::text`,
    })
    .from(callCostLineItems)
    .innerJoin(callCosts, eq(callCostLineItems.callCostId, callCosts.id))
    .where(
      and(
        eq(callCosts.tenantId, input.tenantId),
        gte(callCosts.createdAt, input.startDate),
        lte(callCosts.createdAt, input.endDate),
      ),
    )
    .groupBy(callCostLineItems.service);

  const costBreakdown: Record<string, string> = {};
  for (const row of breakdown) {
    costBreakdown[row.service] = row.total;
  }

  return {
    totalCost: costResult.totalCost,
    totalCalls: callResult.count,
    costBreakdown,
    period: {
      start: input.startDate.toISOString(),
      end: input.endDate.toISOString(),
    },
  };
}

export async function getDailyCostTrend(input: {
  tenantId: string;
  startDate: Date;
  endDate: Date;
}): Promise<Array<{ date: string; cost: string; calls: number }>> {
  const results = await db
    .select({
      date: sql<string>`DATE(${callCosts.createdAt})::text`,
      cost: sql<string>`SUM(${callCosts.totalCost}::numeric)::text`,
      calls: sql<number>`COUNT(DISTINCT ${callCosts.callSessionId})::int`,
    })
    .from(callCosts)
    .where(
      and(
        eq(callCosts.tenantId, input.tenantId),
        gte(callCosts.createdAt, input.startDate),
        lte(callCosts.createdAt, input.endDate),
      ),
    )
    .groupBy(sql`DATE(${callCosts.createdAt})`)
    .orderBy(sql`DATE(${callCosts.createdAt})`);

  return results;
}

export async function checkPlanLimits(tenantId: string): Promise<{
  withinLimits: boolean;
  currentUsage: { calls: number; cost: string };
  plan: string;
}> {
  const [tenant] = await db
    .select({ plan: tenantRegistry.plan })
    .from(tenantRegistry)
    .where(eq(tenantRegistry.id, tenantId))
    .limit(1);

  const plan = tenant?.plan ?? 'starter';

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const summary = await getTenantBillingSummary({
    tenantId,
    startDate: monthStart,
    endDate: now,
  });

  const planLimits: Record<string, { maxCalls: number; maxCost: number }> = {
    starter: { maxCalls: 500, maxCost: 50 },
    professional: { maxCalls: 5000, maxCost: 500 },
    enterprise: { maxCalls: 50000, maxCost: 5000 },
  };

  const limits = planLimits[plan] ?? planLimits.starter;
  const withinLimits =
    summary.totalCalls <= limits.maxCalls &&
    parseFloat(summary.totalCost) <= limits.maxCost;

  return {
    withinLimits,
    currentUsage: { calls: summary.totalCalls, cost: summary.totalCost },
    plan,
  };
}
