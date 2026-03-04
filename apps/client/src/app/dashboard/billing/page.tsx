'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useGetSummaryQuery, useGetTrendQuery, useGetLimitsQuery } from '@/features/billing/billingApi';

const trendChartConfig = {
  cost: { label: 'Cost ($)', color: 'var(--primary)' },
} satisfies ChartConfig;

export default function BillingPage() {
  const { data: summary, isLoading: summaryLoading } = useGetSummaryQuery();
  const { data: limits, isLoading: limitsLoading } = useGetLimitsQuery();
  const { data: trendData, isLoading: trendLoading } = useGetTrendQuery();

  const trend = trendData?.data ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">
          Usage costs and plan limits
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total cost</CardTitle>
            <CardDescription>
              {summary ? `${summary.period.start} – ${summary.period.end}` : 'Current period'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">${summary?.totalCost ?? '0.00'}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total calls</CardTitle>
            <CardDescription>Calls in period</CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold">{summary?.totalCalls ?? 0}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>
              {limits?.withinLimits ? 'Within limits' : 'Limits exceeded'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {limitsLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="space-y-2">
                <p className="text-lg font-semibold capitalize">{limits?.plan ?? '—'}</p>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{limits?.currentUsage.calls ?? 0} calls</span>
                  <span>${limits?.currentUsage.cost ?? '0.00'} spent</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {summary && Object.keys(summary.costBreakdown).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost breakdown</CardTitle>
            <CardDescription>Costs by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(summary.costBreakdown).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-semibold">${value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daily cost trend</CardTitle>
          <CardDescription>Cost per day over the current period</CardDescription>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : trend.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No trend data available</p>
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
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `$${v}`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="cost" fill="var(--color-cost)" radius={6} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {limits && (
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>Calls used this period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{limits.currentUsage.calls} calls</span>
                <span className="text-muted-foreground">${limits.currentUsage.cost} spent</span>
              </div>
              <Progress
                value={limits.withinLimits ? Math.min((limits.currentUsage.calls / 500) * 100, 100) : 100}
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
