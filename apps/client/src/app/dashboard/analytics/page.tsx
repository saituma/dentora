'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { StatsCard } from '@/components/stats-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Bar, BarChart, XAxis as BarXAxis, YAxis, CartesianGrid } from 'recharts';
import { useGetDashboardStatsQuery, useGetHourlyVolumeQuery } from '@/features/analytics/analyticsApi';

const hourlyChartConfig = {
  calls: { label: 'Calls', color: 'var(--chart-1)' },
} satisfies ChartConfig;

function getDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString();
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  return { startDate: start, endDate: end };
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30d');

  const params = useMemo(() => getDateRange(dateRange), [dateRange]);
  const { data: stats, isLoading: statsLoading } = useGetDashboardStatsQuery(params);
  const { data: hourlyData, isLoading: hourlyLoading } = useGetHourlyVolumeQuery(params);

  const hourlyVolume = hourlyData?.data ?? [];
  const totalCalls = stats?.totalCalls ?? 0;
  const completionRate = stats?.completionRate ?? 0;
  const avgDuration = stats?.averageDurationSeconds ?? 0;
  const avgLatency = stats?.averageLatencyMs ?? 0;
  const callsByStatus = stats?.callsByStatus ?? {};
  const topIntents = stats?.topIntents ?? [];

  const noData = !statsLoading && totalCalls === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Performance metrics and insights
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={dateRange}
            onValueChange={(value) => setDateRange(value ?? '30d')}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {noData ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No call data yet. Analytics will appear once your AI receptionist handles calls.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))
            ) : (
              <>
                <StatsCard
                  title="Total calls"
                  value={String(totalCalls)}
                />
                <StatsCard
                  title="Completion rate"
                  value={`${completionRate.toFixed(1)}%`}
                />
                <StatsCard
                  title="Avg duration"
                  value={avgDuration > 0 ? `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s` : '—'}
                />
                <StatsCard
                  title="Avg latency"
                  value={avgLatency > 0 ? `${avgLatency}ms` : '—'}
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Calls by status</CardTitle>
                <CardDescription>How the AI receptionist handled inbound volume</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : Object.keys(callsByStatus).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(callsByStatus).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm font-medium capitalize">{status.replace(/_/g, ' ')}</span>
                        <span className="text-sm text-muted-foreground">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top intents</CardTitle>
                <CardDescription>Most frequent patient requests</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : topIntents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No intent data yet</p>
                ) : (
                  <div className="space-y-3">
                    {topIntents.map((item) => (
                      <div key={item.intent} className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm font-medium">{item.intent}</span>
                        <span className="text-sm text-muted-foreground">{item.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Hourly call volume</CardTitle>
              <CardDescription>Peak windows to optimize staffing and transfer policy</CardDescription>
            </CardHeader>
            <CardContent>
              {hourlyLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : hourlyVolume.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hourly data yet</p>
              ) : (
                <ChartContainer config={hourlyChartConfig} className="h-[300px] w-full">
                  <BarChart data={hourlyVolume}>
                    <CartesianGrid vertical={false} />
                    <BarXAxis
                      dataKey="hour"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return d.toLocaleTimeString('en-US', { hour: 'numeric' });
                      }}
                    />
                    <YAxis tickLine={false} axisLine={false} width={36} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="calls" fill="var(--color-calls)" radius={6} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
