'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGetDashboardStatsQuery, useGetHourlyVolumeQuery } from '@/features/analytics/analyticsApi';
import type { HourlyVolume } from '@/features/analytics/types';
import { useGetCallsQuery } from '@/features/calls/callsApi';
import { useGetIntegrationsQuery } from '@/features/integrations/integrationsApi';
import { useGetUpcomingAppointmentsQuery } from '@/features/appointments/appointmentsApi';

const performanceChartConfig = {
  calls: { label: 'Calls', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const intentChartConfig = {
  count: { label: 'Requests', color: 'var(--primary)' },
} satisfies ChartConfig;

const PERIOD_OPTIONS = [
  { value: '24h' as const, label: 'Last 24 hours' },
  { value: '7d' as const, label: 'Last 7 days' },
  { value: '30d' as const, label: 'Last 30 days' },
  { value: '6m' as const, label: 'Last 6 months' },
  { value: '1y' as const, label: 'Last year' },
  { value: 'lifetime' as const, label: 'Lifetime' },
];

type PeriodPreset = (typeof PERIOD_OPTIONS)[number]['value'];

function getDateRangeForPreset(preset: PeriodPreset): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  switch (preset) {
    case '24h':
      start.setTime(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '6m':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'lifetime':
      start.setTime(0);
      break;
    default:
      start.setDate(start.getDate() - 7);
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function periodSummaryLine(preset: PeriodPreset): string {
  switch (preset) {
    case '24h':
      return 'the past 24 hours';
    case '7d':
      return 'the last 7 days';
    case '30d':
      return 'the last 30 days';
    case '6m':
      return 'the last 6 months';
    case '1y':
      return 'the last year';
    case 'lifetime':
      return 'all time';
    default:
      return 'the selected period';
  }
}

function statsCardPeriodPhrase(preset: PeriodPreset): string {
  switch (preset) {
    case '24h':
      return 'Past 24 hours';
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case '6m':
      return 'Last 6 months';
    case '1y':
      return 'Last year';
    case 'lifetime':
      return 'All time';
    default:
      return 'Selected period';
  }
}

function aggregateDailyFromHourly(hourlyRows: HourlyVolume[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of hourlyRows) {
    const parsed = new Date(row.hour);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = parsed.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + row.calls);
  }
  return map;
}

function eachCalendarDayInclusive(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function buildVolumeChartData(
  preset: PeriodPreset,
  rangeStart: Date,
  rangeEnd: Date,
  hourlyRows: HourlyVolume[],
): Array<{ label: string; calls: number }> {
  if (preset === '24h') {
    const points: Array<{ label: string; calls: number }> = [];
    const anchor = new Date(rangeEnd);
    anchor.setMinutes(0, 0, 0);
    anchor.setSeconds(0, 0);
    anchor.setMilliseconds(0);
    for (let i = 23; i >= 0; i--) {
      const slotStart = new Date(anchor);
      slotStart.setHours(anchor.getHours() - i);
      const keyPrefix = slotStart.toISOString().slice(0, 13);
      let calls = 0;
      for (const row of hourlyRows) {
        const t = new Date(row.hour);
        if (Number.isNaN(t.getTime())) continue;
        if (t.toISOString().slice(0, 13) === keyPrefix) {
          calls += row.calls;
        }
      }
      points.push({
        label: slotStart.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        calls,
      });
    }
    return points;
  }

  const dailyMap = aggregateDailyFromHourly(hourlyRows);

  if (preset === '7d') {
    const anchor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + index);
      return {
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        calls: dailyMap.get(date.toISOString().slice(0, 10)) ?? 0,
      };
    });
  }

  if (preset === '30d') {
    const anchor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    return Array.from({ length: 30 }).map((_, index) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + index);
      return {
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        calls: dailyMap.get(date.toISOString().slice(0, 10)) ?? 0,
      };
    });
  }

  if (preset === '6m') {
    const days = eachCalendarDayInclusive(rangeStart, rangeEnd);
    return days.map((date) => ({
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      calls: dailyMap.get(date.toISOString().slice(0, 10)) ?? 0,
    }));
  }

  if (preset === '1y') {
    const weekMap = new Map<string, number>();
    for (const [dayKey, calls] of dailyMap) {
      const d = new Date(`${dayKey}T12:00:00`);
      const wk = startOfWeekMonday(d).toISOString().slice(0, 10);
      weekMap.set(wk, (weekMap.get(wk) ?? 0) + calls);
    }
    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, calls]) => ({
        label: new Date(`${wk}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        calls,
      }));
  }

  const monthMap = new Map<string, number>();
  for (const [dayKey, calls] of dailyMap) {
    const mk = dayKey.slice(0, 7);
    monthMap.set(mk, (monthMap.get(mk) ?? 0) + calls);
  }
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mk, calls]) => {
      const [y, m] = mk.split('-');
      const date = new Date(Number(y), Number(m) - 1, 1);
      return {
        label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        calls,
      };
    });
}

function volumeChartTitle(preset: PeriodPreset): string {
  switch (preset) {
    case '24h':
      return 'Hourly call volume';
    case '1y':
      return 'Weekly call volume';
    case 'lifetime':
      return 'Monthly call volume';
    default:
      return 'Daily call volume';
  }
}

function volumeChartDescription(preset: PeriodPreset): string {
  switch (preset) {
    case '24h':
      return 'Inbound calls by hour for the past 24 hours';
    case '1y':
      return 'Calls aggregated by week over the last year';
    case 'lifetime':
      return 'Calls aggregated by month across all history';
    default:
      return 'Inbound calls per day across the selected range';
  }
}

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
  const [period, setPeriod] = useState<PeriodPreset>('7d');

  const dateRange = useMemo(() => getDateRangeForPreset(period), [period]);

  const { data: integrationData } = useGetIntegrationsQuery();
  const integrations = integrationData?.data ?? [];
  const hasActiveCalendar = integrations.some(
    (integration) =>
      integration.integrationType === 'calendar' &&
      integration.provider === 'google_calendar' &&
      integration.status === 'active',
  );

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

  const rangeStart = useMemo(() => new Date(dateRange.startDate), [dateRange.startDate]);
  const rangeEnd = useMemo(() => new Date(dateRange.endDate), [dateRange.endDate]);

  const dailyPerformance = useMemo(
    () =>
      buildVolumeChartData(period, rangeStart, rangeEnd, hourlyVolume?.data ?? []),
    [period, rangeStart, rangeEnd, hourlyVolume?.data],
  );

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
      <div className="flex flex-col gap-4 rounded-xl border bg-card px-5 py-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">
            Performance across calls, outcomes, and AI usage for {periodSummaryLine(period)}
          </p>
        </div>
        <div className="flex shrink-0 justify-end sm:pt-0.5">
          <Select value={period} onValueChange={(value) => setPeriod((value as PeriodPreset) ?? '7d')}>
            <SelectTrigger className="w-[min(100%,200px)] min-w-[160px]" size="sm" aria-label="Time range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total calls"
          value={dashboardStats ? dashboardStats.totalCalls.toLocaleString() : '--'}
          description={`Inbound calls — ${statsCardPeriodPhrase(period)}`}
          className="bg-card"
        />
        <StatsCard
          title="booked appointment rate"
          value={dashboardStats ? formatPercent(dashboardStats.completionRate) : '--'}
          description={`Calls that finished successfully (${statsCardPeriodPhrase(period)})`}
          className="bg-card"
        />
        <StatsCard
          title="Avg call duration"
          value={dashboardStats ? formatDuration(dashboardStats.averageDurationSeconds) : '--'}
          description={`Average call length (${statsCardPeriodPhrase(period)})`}
          className="bg-card"
        />
        <StatsCard
          title="ROI using AI"
          value={dashboardStats ? formatMoney(dashboardStats.totalCost) : '--'}
          description={`Telephony + AI usage (${statsCardPeriodPhrase(period)})`}
          className="bg-card"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{volumeChartTitle(period)}</CardTitle>
            <CardDescription>{volumeChartDescription(period)}</CardDescription>
          </CardHeader>
          <CardContent>
            {hourlyLoading ? (
              <div className="text-sm text-muted-foreground">Loading call volume…</div>
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
                  <BarXAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    tick={{ fontSize: 11 }}
                  />
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
