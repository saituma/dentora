'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/stats-card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis as BarXAxis,
  YAxis,
} from 'recharts';
import { PhoneIcon, CalendarIcon } from 'lucide-react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetDashboardStatsQuery, useGetHourlyVolumeQuery } from '@/features/analytics/analyticsApi';
import { useGetCallsQuery } from '@/features/calls/callsApi';
import { useGetIntegrationsQuery } from '@/features/integrations/integrationsApi';
import { useGetUpcomingAppointmentsQuery } from '@/features/appointments/appointmentsApi';

const performanceChartConfig = {
  calls: { label: 'Calls', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const intentChartConfig = {
  count: { label: 'Requests', color: 'var(--primary)' },
} satisfies ChartConfig;

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return '0m 0s';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

function formatMoney(value?: string | number | null) {
  const numberValue = typeof value === 'string' ? Number.parseFloat(value) : value ?? 0;
  if (!Number.isFinite(numberValue)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numberValue);
}

function formatPercent(value?: number | null) {
  const percent = typeof value === 'number' ? value : 0;
  return `${percent.toFixed(1)}%`;
}

export default function DashboardOverviewPage() {
  const { data: integrationData } = useGetIntegrationsQuery();
  const integrations = integrationData?.data ?? [];
  const hasActiveCalendar = integrations.some(
    (integration) =>
      integration.integrationType === 'calendar' &&
      integration.provider === 'google_calendar' &&
      integration.status === 'active',
  );

  const dateRange = useMemo(() => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
    return {
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
    };
  }, []);

  const { data: dashboardStats, isLoading: statsLoading } = useGetDashboardStatsQuery(dateRange);
  const { data: hourlyVolume, isLoading: hourlyLoading } = useGetHourlyVolumeQuery(dateRange);
  const { data: callsData, isLoading: callsLoading } = useGetCallsQuery({ limit: 5 });
  const {
    data: upcomingAppointments,
    isLoading: upcomingLoading,
    error: upcomingError,
  } = useGetUpcomingAppointmentsQuery(
    hasActiveCalendar ? { days: 7 } : skipToken,
  );

  const dailyVolumeMap = new Map<string, { date: Date; calls: number }>();
  (hourlyVolume?.data ?? []).forEach((row) => {
    const parsed = new Date(row.hour);
    if (Number.isNaN(parsed.getTime())) return;
    const key = parsed.toISOString().slice(0, 10);
    const existing = dailyVolumeMap.get(key);
    if (existing) {
      existing.calls += row.calls;
    } else {
      dailyVolumeMap.set(key, { date: parsed, calls: row.calls });
    }
  });

  const rangeStart = useMemo(() => new Date(dateRange.startDate), [dateRange.startDate]);
  const dailyPerformance = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(rangeStart);
    date.setDate(rangeStart.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const entry = dailyVolumeMap.get(key);
    return {
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      calls: entry?.calls ?? 0,
    };
  });

  const statusEntries = Object.entries(dashboardStats?.callsByStatus ?? {})
    .map(([status, count], index) => ({
      status,
      label: status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      value: count,
      color: `var(--chart-${(index % 5) + 1})`,
    }))
    .filter((entry) => entry.value > 0);

  const statusChartConfig: ChartConfig = statusEntries.reduce((acc, entry) => {
    acc[entry.status] = { label: entry.label, color: entry.color };
    return acc;
  }, {} as ChartConfig);

  const intentBreakdown = dashboardStats?.topIntents ?? [];
  const recentCalls = callsData?.data ?? [];
  const upcomingEvents = upcomingAppointments?.data?.events ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">
            Real-time performance across calls, outcomes, and AI availability for the last 7 days
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total calls"
          value={dashboardStats ? dashboardStats.totalCalls.toLocaleString() : '--'}
          description="Inbound calls handled in the last 7 days"
          className="bg-card"
        />
        <StatsCard
          title="booked appointment rate"
          value={dashboardStats ? formatPercent(dashboardStats.completionRate) : '--'}
          description="Calls that finished successfully"
          className="bg-card"
        />
        <StatsCard
          title="Avg call duration"
          value={dashboardStats ? formatDuration(dashboardStats.averageDurationSeconds) : '--'}
          description="Average call length"
          className="bg-card"
        />
        <StatsCard
          title="AI spend"
          value={dashboardStats ? formatMoney(dashboardStats.totalCost) : '--'}
          description="Telephony + AI usage costs"
          className="bg-card"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Weekly call volume</CardTitle>
            <CardDescription>Daily inbound calls across the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {hourlyLoading ? (
              <div className="text-sm text-muted-foreground">Loading weekly volume…</div>
            ) : (
              <ChartContainer config={performanceChartConfig} className="h-[280px] w-full">
                <AreaChart data={dailyPerformance}>
                  <defs>
                    <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-calls)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-calls)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <BarXAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <Area
                    type="monotone"
                    dataKey="calls"
                    fill="url(#fillCalls)"
                    stroke="var(--color-calls)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Call status mix</CardTitle>
            <CardDescription>Distribution of call outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="text-sm text-muted-foreground">Loading status mix…</div>
            ) : statusEntries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No call status data yet.</div>
            ) : (
              <ChartContainer config={statusChartConfig} className="h-[280px] w-full">
                <PieChart>
                  <Pie
                    data={statusEntries}
                    dataKey="value"
                    nameKey="status"
                    innerRadius={56}
                    outerRadius={84}
                    paddingAngle={2}
                  >
                    {statusEntries.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                  <ChartLegend content={<ChartLegendContent nameKey="status" />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top caller intents</CardTitle>
            <CardDescription>Highest-volume patient requests handled by the AI receptionist</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="text-sm text-muted-foreground">Loading intent data…</div>
            ) : intentBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground">No intent data captured yet.</div>
            ) : (
              <ChartContainer config={intentChartConfig} className="h-[260px] w-full">
                <BarChart data={intentBreakdown} layout="vertical" margin={{ left: 16, right: 12 }}>
                  <CartesianGrid horizontal={false} />
                  <BarXAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="intent"
                    tickLine={false}
                    axisLine={false}
                    width={130}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={6} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest AI call sessions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {callsLoading ? (
              <div className="text-sm text-muted-foreground">Loading recent calls…</div>
            ) : recentCalls.length === 0 ? (
              <div className="text-sm text-muted-foreground">No calls yet.</div>
            ) : (
              recentCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                      <PhoneIcon className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{call.callerNumber || 'Unknown caller'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(call.startedAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {call.status === 'completed'
                      ? `Completed • ${formatDuration(call.durationSeconds)}`
                      : call.status.replace(/_/g, ' ')}
                  </p>
                </div>
              ))
            )}
            <Button variant="outline" className="w-full" asChild>
              <Link href="/dashboard/calls">View full call history</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Upcoming appointments</CardTitle>
            <CardDescription>Next 7 days from your connected calendar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!hasActiveCalendar ? (
              <div className="text-sm text-muted-foreground">
                Connect Google Calendar to show upcoming appointments.
              </div>
            ) : upcomingLoading ? (
              <div className="text-sm text-muted-foreground">Loading upcoming appointments…</div>
            ) : upcomingError ? (
              <div className="text-sm text-muted-foreground">
                Unable to load upcoming appointments. Check the calendar integration.
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground">No upcoming appointments found.</div>
            ) : (
              upcomingEvents.slice(0, 6).map((event) => {
                const start = new Date(event.start);
                const end = new Date(event.end);
                const timeLabel = Number.isNaN(start.getTime())
                  ? event.start
                  : `${start.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })} — ${Number.isNaN(end.getTime())
                      ? event.end
                      : end.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`;

                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{event.summary || 'Appointment'}</div>
                      <div className="text-xs text-muted-foreground">{timeLabel}</div>
                    </div>
                    <span className="text-xs text-muted-foreground">{event.status}</span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="size-5" />
            {hasActiveCalendar
              ? 'Calendar connected'
              : 'Next step: Connect your calendar'}
          </CardTitle>
          <CardDescription>
            {hasActiveCalendar
              ? 'Manage calendar sync and connection health from Integrations'
              : 'Connect Google Calendar or Outlook to enable AI appointment booking'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant={hasActiveCalendar ? 'outline' : 'default'} asChild>
            <Link href="/dashboard/integrations">
              {hasActiveCalendar ? 'Manage integrations' : 'Connect calendar'}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
