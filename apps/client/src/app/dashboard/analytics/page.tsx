'use client';

import { useMemo, useState } from 'react';
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
import { useGetDashboardStatsQuery, useGetHourlyVolumeQuery } from '@/features/analytics/analyticsApi';

const hourlyChartConfig = {
  calls: { label: 'Calls', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const formatDuration = (seconds?: number): string => {
  if (!seconds && seconds !== 0) return '--';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
};

const formatPercent = (value?: number): string => {
  if (value == null) return '--';
  return `${value.toFixed(1)}%`;
};

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30d');

  const dateRangeParams = useMemo(() => {
    const days = Number.parseInt(dateRange.replace('d', ''), 10) || 30;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }, [dateRange]);

  const { data: stats, isLoading: statsLoading } = useGetDashboardStatsQuery(dateRangeParams);
  const { data: hourlyData, isLoading: hourlyLoading } = useGetHourlyVolumeQuery(dateRangeParams);
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
        <StatsCard
          title="Total calls"
          value={statsLoading ? '--' : String(stats?.totalCalls ?? 0)}
        />
        <StatsCard
          title="Completion rate"
          value={statsLoading ? '--' : formatPercent(stats?.completionRate)}
        />
        <StatsCard
          title="Avg duration"
          value={statsLoading ? '--' : formatDuration(stats?.averageDurationSeconds)}
          description="Balanced between speed and rapport"
        />
        <StatsCard
          title="Avg latency"
          value={statsLoading ? '--' : `${stats?.averageLatencyMs ?? 0}ms`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calls by status</CardTitle>
            <CardDescription>How the AI receptionist handled inbound volume</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="text-sm text-muted-foreground">Loading status breakdown...</div>
            ) : stats?.callsByStatus && Object.keys(stats.callsByStatus).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(stats.callsByStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="text-sm font-medium capitalize">{status.replace(/_/g, ' ')}</span>
                    <span className="text-sm text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No call status data yet.</div>
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
              <div className="text-sm text-muted-foreground">Loading intents...</div>
            ) : (stats?.topIntents?.length ?? 0) > 0 ? (
              <div className="space-y-3">
                {stats!.topIntents.map((item) => (
                  <div key={item.intent} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="text-sm font-medium">{item.intent}</span>
                    <span className="text-sm text-muted-foreground">{item.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No intent data yet.</div>
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
            <div className="text-sm text-muted-foreground">Loading hourly volume...</div>
          ) : hourlyVolume.length === 0 ? (
            <div className="text-sm text-muted-foreground">No hourly volume data yet.</div>
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
    </div>
  );
}