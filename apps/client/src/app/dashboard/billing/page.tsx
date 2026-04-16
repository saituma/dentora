'use client';

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { CreditCardIcon, ExternalLinkIcon } from 'lucide-react';
import {
  useGetSummaryQuery,
  useGetTrendQuery,
  useGetLimitsQuery,
  useGetSubscriptionQuery,
  useCreatePortalSessionMutation,
} from '@/features/billing/billingApi';

const trendChartConfig = {
  cost: { label: 'Cost ($)', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const PLAN_DISPLAY: Record<string, { name: string; callsIncluded: number; minutesIncluded: number }> = {
  starter: { name: 'Starter', callsIncluded: 600, minutesIncluded: 3000 },
  growth: { name: 'Growth', callsIncluded: 2500, minutesIncluded: 9000 },
  pro: { name: 'Pro', callsIncluded: 10000, minutesIncluded: 36000 },
  professional: { name: 'Professional', callsIncluded: 5000, minutesIncluded: 18000 },
  enterprise: { name: 'Enterprise', callsIncluded: 50000, minutesIncluded: 180000 },
};

function formatMoney(value?: string | number | null) {
  const num = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  if (!Number.isFinite(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

export default function BillingPage() {
  const dateRange = useMemo(() => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
    };
  }, []);

  const { data: summary, isLoading: summaryLoading } = useGetSummaryQuery(dateRange);
  const { data: trendData, isLoading: trendLoading } = useGetTrendQuery(dateRange);
  const { data: limits, isLoading: limitsLoading } = useGetLimitsQuery();
  const { data: subscription, isLoading: subLoading } = useGetSubscriptionQuery();
  const [createPortal, { isLoading: portalLoading }] = useCreatePortalSessionMutation();

  const trend = trendData?.data ?? [];
  const planInfo = PLAN_DISPLAY[limits?.plan ?? subscription?.plan ?? 'starter'] ?? PLAN_DISPLAY.starter;

  const callsUsagePercent = limits
    ? Math.min((limits.currentUsage.calls / planInfo.callsIncluded) * 100, 100)
    : 0;

  const handleManageSubscription = async () => {
    try {
      const result = await createPortal({
        returnUrl: window.location.href,
      }).unwrap();
      window.location.href = result.url;
    } catch {
      // Error handled by RTK Query
    }
  };

  const periodLabel = summary
    ? `${new Date(summary.period.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(summary.period.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'Current period';

  const statusBadge = subscription?.status === 'active'
    ? <Badge variant="default" className="bg-green-600">Active</Badge>
    : subscription?.status === 'trialing'
      ? <Badge variant="secondary">Trial</Badge>
      : subscription?.status
        ? <Badge variant="outline">{subscription.status}</Badge>
        : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Billing</h2>
          <p className="text-sm text-muted-foreground">
            Subscription, usage, and cost breakdown
          </p>
        </div>
        <Button
          variant="outline"
          disabled={portalLoading || !subscription?.stripeCustomerId}
          onClick={handleManageSubscription}
        >
          <CreditCardIcon className="mr-2 size-4" />
          {portalLoading ? 'Opening...' : 'Manage Subscription'}
          <ExternalLinkIcon className="ml-2 size-3" />
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total cost</CardTitle>
            <CardDescription>{periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summaryLoading ? '...' : formatMoney(summary?.totalCost)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total calls</CardTitle>
            <CardDescription>Calls in period</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summaryLoading ? '...' : (summary?.totalCalls ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current plan</CardTitle>
            <CardDescription className="flex items-center gap-2">
              {statusBadge}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">
              {subLoading ? '...' : planInfo.name}
            </p>
            {subscription?.currentPeriodEnd && (
              <p className="mt-1 text-xs text-muted-foreground">
                Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>
              {limitsLoading ? '...' : limits?.withinLimits ? 'Within limits' : 'Limits exceeded'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{limits?.currentUsage.calls ?? 0} / {planInfo.callsIncluded} calls</span>
                <span className="text-muted-foreground">{Math.round(callsUsagePercent)}%</span>
              </div>
              <Progress value={callsUsagePercent} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost breakdown */}
      {summary && Object.keys(summary.costBreakdown).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost breakdown</CardTitle>
            <CardDescription>Core AI infrastructure spend categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(summary.costBreakdown).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-semibold">{formatMoney(value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily cost trend chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily cost trend</CardTitle>
          <CardDescription>AI infrastructure costs over time</CardDescription>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <div className="text-sm text-muted-foreground">Loading cost trend…</div>
          ) : trend.length === 0 ? (
            <div className="text-sm text-muted-foreground">No cost data for this period yet.</div>
          ) : (
            <ChartContainer config={trendChartConfig} className="h-[250px] w-full">
              <BarChart data={trend}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `$${v}`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="cost" fill="var(--color-cost)" radius={6} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
