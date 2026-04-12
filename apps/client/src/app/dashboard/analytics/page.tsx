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
import { Bar, BarChart, XAxis as BarXAxis, YAxis, CartesianGrid } from 'recharts';

const hourlyChartConfig = {
  calls: { label: 'Calls', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const periodStats = {
  '7d': {
    totalCalls: 492,
    completionRate: 88.2,
    averageDurationSeconds: 232,
    averageLatencyMs: 610,
    callsByStatus: {
      completed: 434,
      transferred: 35,
      voicemail: 15,
      dropped: 8,
    },
    topIntents: [
      { intent: 'Cleaning & Hygiene', count: 142 },
      { intent: 'Emergency Pain', count: 104 },
      { intent: 'New Patient Consultation', count: 78 },
      { intent: 'Reschedule / Cancellation', count: 63 },
      { intent: 'Insurance Questions', count: 44 },
    ],
    hourlyVolume: [
      { hour: '2026-03-01T08:00:00.000Z', calls: 16 },
      { hour: '2026-03-01T09:00:00.000Z', calls: 31 },
      { hour: '2026-03-01T10:00:00.000Z', calls: 48 },
      { hour: '2026-03-01T11:00:00.000Z', calls: 52 },
      { hour: '2026-03-01T12:00:00.000Z', calls: 44 },
      { hour: '2026-03-01T13:00:00.000Z', calls: 39 },
      { hour: '2026-03-01T14:00:00.000Z', calls: 46 },
      { hour: '2026-03-01T15:00:00.000Z', calls: 57 },
      { hour: '2026-03-01T16:00:00.000Z', calls: 63 },
      { hour: '2026-03-01T17:00:00.000Z', calls: 55 },
      { hour: '2026-03-01T18:00:00.000Z', calls: 41 },
      { hour: '2026-03-01T19:00:00.000Z', calls: 26 },
    ],
  },
  '30d': {
    totalCalls: 1976,
    completionRate: 86.7,
    averageDurationSeconds: 245,
    averageLatencyMs: 645,
    callsByStatus: {
      completed: 1642,
      transferred: 188,
      voicemail: 102,
      dropped: 44,
    },
    topIntents: [
      { intent: 'Cleaning & Hygiene', count: 541 },
      { intent: 'Emergency Pain', count: 390 },
      { intent: 'New Patient Consultation', count: 298 },
      { intent: 'Reschedule / Cancellation', count: 266 },
      { intent: 'Insurance Questions', count: 181 },
    ],
    hourlyVolume: [
      { hour: '2026-03-01T08:00:00.000Z', calls: 61 },
      { hour: '2026-03-01T09:00:00.000Z', calls: 122 },
      { hour: '2026-03-01T10:00:00.000Z', calls: 171 },
      { hour: '2026-03-01T11:00:00.000Z', calls: 186 },
      { hour: '2026-03-01T12:00:00.000Z', calls: 158 },
      { hour: '2026-03-01T13:00:00.000Z', calls: 136 },
      { hour: '2026-03-01T14:00:00.000Z', calls: 149 },
      { hour: '2026-03-01T15:00:00.000Z', calls: 182 },
      { hour: '2026-03-01T16:00:00.000Z', calls: 214 },
      { hour: '2026-03-01T17:00:00.000Z', calls: 197 },
      { hour: '2026-03-01T18:00:00.000Z', calls: 143 },
      { hour: '2026-03-01T19:00:00.000Z', calls: 87 },
    ],
  },
  '90d': {
    totalCalls: 5713,
    completionRate: 84.9,
    averageDurationSeconds: 252,
    averageLatencyMs: 688,
    callsByStatus: {
      completed: 4653,
      transferred: 611,
      voicemail: 316,
      dropped: 133,
    },
    topIntents: [
      { intent: 'Cleaning & Hygiene', count: 1570 },
      { intent: 'Emergency Pain', count: 1165 },
      { intent: 'New Patient Consultation', count: 902 },
      { intent: 'Reschedule / Cancellation', count: 701 },
      { intent: 'Insurance Questions', count: 523 },
    ],
    hourlyVolume: [
      { hour: '2026-03-01T08:00:00.000Z', calls: 176 },
      { hour: '2026-03-01T09:00:00.000Z', calls: 358 },
      { hour: '2026-03-01T10:00:00.000Z', calls: 496 },
      { hour: '2026-03-01T11:00:00.000Z', calls: 545 },
      { hour: '2026-03-01T12:00:00.000Z', calls: 472 },
      { hour: '2026-03-01T13:00:00.000Z', calls: 431 },
      { hour: '2026-03-01T14:00:00.000Z', calls: 458 },
      { hour: '2026-03-01T15:00:00.000Z', calls: 519 },
      { hour: '2026-03-01T16:00:00.000Z', calls: 604 },
      { hour: '2026-03-01T17:00:00.000Z', calls: 562 },
      { hour: '2026-03-01T18:00:00.000Z', calls: 417 },
      { hour: '2026-03-01T19:00:00.000Z', calls: 271 },
    ],
  },
} as const;

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30d');

  const stats = useMemo(() => {
    return periodStats[dateRange as keyof typeof periodStats];
  }, [dateRange]);
  const hourlyVolume = stats.hourlyVolume.map((entry) => ({ ...entry }));

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
          value={String(stats.totalCalls)}
          trend={{ value: 14.6, label: 'More calls captured after-hours' }}
        />
        <StatsCard
          title="Completion rate"
          value={`${stats.completionRate.toFixed(1)}%`}
          trend={{ value: 4.2, label: 'Automation quality improving' }}
        />
        <StatsCard
          title="Avg duration"
          value={`${Math.round(stats.averageDurationSeconds / 60)}m ${stats.averageDurationSeconds % 60}s`}
          description="Balanced between speed and rapport"
        />
        <StatsCard
          title="Avg latency"
          value={`${stats.averageLatencyMs}ms`}
          trend={{ value: -9.8, label: 'Lower response delay', positive: true }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calls by status</CardTitle>
            <CardDescription>How the AI receptionist handled inbound volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.callsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium capitalize">{status.replace(/_/g, ' ')}</span>
                  <span className="text-sm text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top intents</CardTitle>
            <CardDescription>Most frequent patient requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topIntents.map((item) => (
                <div key={item.intent} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">{item.intent}</span>
                  <span className="text-sm text-muted-foreground">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hourly call volume</CardTitle>
          <CardDescription>Peak windows to optimize staffing and transfer policy</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
