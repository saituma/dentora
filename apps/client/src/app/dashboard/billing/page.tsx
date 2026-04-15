"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useGetLimitsQuery, useGetSummaryQuery, useGetTrendQuery } from '@/features/billing/billingApi';

const trendChartConfig = {
  cost: { label: 'Cost ($)', color: 'var(--chart-1)' },
  calls: { label: 'Calls', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const formatCurrency = (value?: string | number | null): string => {
  if (value == null) return '--';
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(parsed)) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parsed);
};

const formatPeriod = (value?: string | null): string => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function BillingPage() {
  const { data: summary, isLoading: summaryLoading } = useGetSummaryQuery();
  const { data: trendData, isLoading: trendLoading } = useGetTrendQuery();
  const { data: limits, isLoading: limitsLoading } = useGetLimitsQuery();

  const trend = (trendData?.data ?? []).map((item) => ({
    date: item.date,
    cost: Number.parseFloat(item.cost),
    calls: item.calls,
  }));

  const periodLabel = summary
    ? `${formatPeriod(summary.period.start)} – ${formatPeriod(summary.period.end)}`
    : 'Current billing period';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">
          Subscription + usage-based performance snapshot
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total cost</CardTitle>
            <CardDescription>
              {periodLabel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summaryLoading ? '--' : formatCurrency(summary?.totalCost)}
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
              {summaryLoading ? '--' : summary?.totalCalls ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total spend</CardTitle>
            <CardDescription>Usage-based cost this period</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summaryLoading ? '--' : formatCurrency(summary?.totalCost)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>
              {limitsLoading ? 'Checking limits...' : limits?.withinLimits ? 'Within limits' : 'Limits exceeded'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-lg font-semibold capitalize">
                {limitsLoading ? '--' : limits?.plan ?? 'starter'}
              </p>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{limitsLoading ? '--' : limits?.currentUsage.calls ?? 0} calls</span>
                <span>{limitsLoading ? '--' : formatCurrency(limits?.currentUsage.cost)} spent</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost breakdown</CardTitle>
          <CardDescription>Core AI infrastructure spend categories</CardDescription>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="text-sm text-muted-foreground">Loading breakdown...</div>
          ) : summary?.costBreakdown && Object.keys(summary.costBreakdown).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(summary.costBreakdown).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-semibold">{formatCurrency(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No cost data yet.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily cost vs call volume</CardTitle>
          <CardDescription>Usage trend for the selected billing period</CardDescription>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <div className="text-sm text-muted-foreground">Loading trend...</div>
          ) : trend.length === 0 ? (
            <div className="text-sm text-muted-foreground">No trend data yet.</div>
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
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) => `$${v}`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="cost" fill="var(--color-cost)" radius={6} />
                <Bar dataKey="calls" fill="var(--color-calls)" radius={6} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>Calls and spend tracked this period</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Calls</span>
              <span>{limitsLoading ? '--' : limits?.currentUsage.calls ?? 0}</span>
            </div>
            <div className="mt-1 flex justify-between text-muted-foreground">
              <span>Cost</span>
              <span>{limitsLoading ? '--' : formatCurrency(limits?.currentUsage.cost)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
