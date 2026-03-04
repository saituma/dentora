'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
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
import { Bar, BarChart, XAxis as BarXAxis, YAxis, CartesianGrid } from 'recharts';
import { Loader2Icon } from 'lucide-react';
import { useGetDashboardStatsQuery, useGetHourlyVolumeQuery } from '@/features/analytics/analyticsApi';

const hourlyChartConfig = {
  calls: { label: 'Calls', color: 'var(--primary)' },
} satisfies ChartConfig;

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30d');

  const dateParams = useMemo(() => {
    const now = new Date();
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const endDate = now.toISOString();
    return { startDate, endDate };
  }, [dateRange]);

  const { data: stats, isLoading: statsLoading } = useGetDashboardStatsQuery(dateParams);
  const { data: hourlyData, isLoading: hourlyLoading } = useGetHourlyVolumeQuery(dateParams);

  const hourlyVolume = hourlyData?.data ?? [];

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2"><div className="h-4 w-24 rounded bg-muted" /></CardHeader>
              <CardContent><div className="h-8 w-16 rounded bg-muted" /></CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatsCard
              title="Total calls"
              value={String(stats?.totalCalls ?? 0)}
            />
            <StatsCard
              title="Completion rate"
              value={`${stats?.completionRate?.toFixed(1) ?? 0}%`}
            />
            <StatsCard
              title="Avg duration"
              value={`${Math.round((stats?.averageDurationSeconds ?? 0) / 60)}m ${(stats?.averageDurationSeconds ?? 0) % 60}s`}
            />
            <StatsCard
              title="Avg latency"
              value={`${stats?.averageLatencyMs ?? 0}ms`}
            />
          </>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Calls by status</CardTitle>
              <CardDescription>Breakdown of call outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(stats.callsByStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="text-sm font-medium capitalize">{status.replace(/_/g, ' ')}</span>
                    <span className="text-sm text-muted-foreground">{count}</span>
                  </div>
                ))}
                {Object.keys(stats.callsByStatus).length === 0 && (
                  <p className="text-sm text-muted-foreground">No data available</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top intents</CardTitle>
              <CardDescription>Most common caller reasons</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topIntents.map((item) => (
                  <div key={item.intent} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="text-sm font-medium">{item.intent}</span>
                    <span className="text-sm text-muted-foreground">{item.count}</span>
                  </div>
                ))}
                {stats.topIntents.length === 0 && (
                  <p className="text-sm text-muted-foreground">No intent data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Hourly call volume</CardTitle>
          <CardDescription>Understand peak call windows</CardDescription>
        </CardHeader>
        <CardContent>
          {hourlyLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : hourlyVolume.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              No hourly data available
            </div>
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
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="calls" fill="var(--color-calls)" radius={6} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}