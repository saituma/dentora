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
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { StatsCard } from '@/components/stats-card';
import {
  ChartContainer,
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
import {
  PhoneIcon,
  CalendarIcon,
  TrendingUpIcon,
  ClockIcon,
  UsersIcon,
  ActivityIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  ZapIcon,
  ShieldCheckIcon,
  PhoneForwardedIcon,
  SmileIcon,
  FrownIcon,
  MinusIcon,
  WifiIcon,
} from 'lucide-react';
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
import { useGetClinicQuery } from '@/features/clinic/clinicApi';
import { cn } from '@/lib/utils';

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
    case '24h': start.setTime(end.getTime() - 24 * 60 * 60 * 1000); break;
    case '7d': start.setDate(start.getDate() - 7); break;
    case '30d': start.setDate(start.getDate() - 30); break;
    case '6m': start.setMonth(start.getMonth() - 6); break;
    case '1y': start.setFullYear(start.getFullYear() - 1); break;
    case 'lifetime': start.setTime(0); break;
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function statsCardPeriodPhrase(preset: PeriodPreset): string {
  const map: Record<PeriodPreset, string> = {
    '24h': 'Past 24h', '7d': 'Last 7 days', '30d': 'Last 30 days',
    '6m': 'Last 6 months', '1y': 'Last year', 'lifetime': 'All time',
  };
  return map[preset] ?? 'Selected period';
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

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return x;
}

function eachCalendarDayInclusive(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return days;
}

function buildVolumeChartData(
  preset: PeriodPreset, rangeStart: Date, rangeEnd: Date, hourlyRows: HourlyVolume[],
): Array<{ label: string; calls: number }> {
  if (preset === '24h') {
    const points: Array<{ label: string; calls: number }> = [];
    const anchor = new Date(rangeEnd);
    anchor.setMinutes(0, 0, 0); anchor.setSeconds(0, 0); anchor.setMilliseconds(0);
    for (let i = 23; i >= 0; i--) {
      const slotStart = new Date(anchor);
      slotStart.setHours(anchor.getHours() - i);
      const keyPrefix = slotStart.toISOString().slice(0, 13);
      let calls = 0;
      for (const row of hourlyRows) {
        const t = new Date(row.hour);
        if (!Number.isNaN(t.getTime()) && t.toISOString().slice(0, 13) === keyPrefix) calls += row.calls;
      }
      points.push({ label: slotStart.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }), calls });
    }
    return points;
  }
  const dailyMap = aggregateDailyFromHourly(hourlyRows);
  if (preset === '7d') {
    const anchor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(anchor); d.setDate(anchor.getDate() + i);
      return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), calls: dailyMap.get(d.toISOString().slice(0, 10)) ?? 0 };
    });
  }
  if (preset === '30d') {
    const anchor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    return Array.from({ length: 30 }).map((_, i) => {
      const d = new Date(anchor); d.setDate(anchor.getDate() + i);
      return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), calls: dailyMap.get(d.toISOString().slice(0, 10)) ?? 0 };
    });
  }
  if (preset === '6m') {
    return eachCalendarDayInclusive(rangeStart, rangeEnd).map((d) => ({
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      calls: dailyMap.get(d.toISOString().slice(0, 10)) ?? 0,
    }));
  }
  if (preset === '1y') {
    const weekMap = new Map<string, number>();
    for (const [dayKey, calls] of dailyMap) {
      const wk = startOfWeekMonday(new Date(`${dayKey}T12:00:00`)).toISOString().slice(0, 10);
      weekMap.set(wk, (weekMap.get(wk) ?? 0) + calls);
    }
    return Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([wk, calls]) => ({
      label: new Date(`${wk}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), calls,
    }));
  }
  const monthMap = new Map<string, number>();
  for (const [dayKey, calls] of dailyMap) { const mk = dayKey.slice(0, 7); monthMap.set(mk, (monthMap.get(mk) ?? 0) + calls); }
  return Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([mk, calls]) => {
    const [y, m] = mk.split('-');
    return { label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), calls };
  });
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMoney(value?: string | number | null) {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value ?? 0;
  if (!Number.isFinite(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatPercent(value?: number | null) {
  return `${(typeof value === 'number' ? value : 0).toFixed(1)}%`;
}

function SentimentIcon({ sentiment }: { sentiment: string }) {
  if (sentiment === 'positive') return <SmileIcon className="size-3.5 text-success-foreground" />;
  if (sentiment === 'negative') return <FrownIcon className="size-3.5 text-destructive" />;
  return <MinusIcon className="size-3.5 text-muted-foreground" />;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' ? 'bg-success' :
    status === 'in_progress' ? 'bg-primary animate-pulse' :
    status === 'escalated' ? 'bg-warning' : 'bg-destructive';
  return <span className={cn('inline-block size-2 rounded-full', color)} />;
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-16" />
      </CardHeader>
    </Card>
  );
}

export default function DashboardOverviewPage() {
  const [period, setPeriod] = useState<PeriodPreset>('7d');
  const dateRange = useMemo(() => getDateRangeForPreset(period), [period]);

  const { data: clinic } = useGetClinicQuery();
  const { data: integrationData } = useGetIntegrationsQuery();
  const integrations = integrationData?.data ?? [];
  const hasActiveCalendar = integrations.some(
    (i) => i.integrationType === 'calendar' && i.provider === 'google_calendar' && i.status === 'active',
  );

  const { data: dashboardStats, isLoading: statsLoading } = useGetDashboardStatsQuery(dateRange);
  const { data: hourlyVolume, isLoading: hourlyLoading } = useGetHourlyVolumeQuery(dateRange);
  const { data: callsData, isLoading: callsLoading } = useGetCallsQuery({ limit: 5 });
  const { data: upcomingAppointments, isLoading: upcomingLoading } = useGetUpcomingAppointmentsQuery(
    hasActiveCalendar ? { days: 7 } : skipToken,
  );

  const rangeStart = useMemo(() => new Date(dateRange.startDate), [dateRange.startDate]);
  const rangeEnd = useMemo(() => new Date(dateRange.endDate), [dateRange.endDate]);
  const dailyPerformance = useMemo(
    () => buildVolumeChartData(period, rangeStart, rangeEnd, hourlyVolume?.data ?? []),
    [period, rangeStart, rangeEnd, hourlyVolume?.data],
  );

  const statusEntries = Object.entries(dashboardStats?.callsByStatus ?? {})
    .map(([status, count], index) => ({
      status, label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value: count, color: `var(--chart-${(index % 5) + 1})`,
    }))
    .filter((e) => e.value > 0);

  const statusChartConfig: ChartConfig = statusEntries.reduce((acc, e) => {
    acc[e.status] = { label: e.label, color: e.color }; return acc;
  }, {} as ChartConfig);

  const intentBreakdown = dashboardStats?.topIntents ?? [];
  const recentCalls = callsData?.data ?? [];
  const upcomingEvents = upcomingAppointments?.data?.events ?? [];

  const sentimentBreakdown = dashboardStats?.sentimentBreakdown ?? {};
  const totalSentiment = Object.values(sentimentBreakdown).reduce((a, b) => a + b, 0);

  const totalCalls = dashboardStats?.totalCalls ?? 0;
  const completedCalls = dashboardStats?.callsByStatus?.completed ?? 0;
  const escalatedCalls = dashboardStats?.callsByStatus?.escalated ?? 0;

  const integrationStatuses = integrations.map((i) => ({
    name: i.provider.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    type: i.integrationType,
    status: i.status,
    healthStatus: i.healthStatus,
    lastSyncAt: i.lastSyncAt,
  }));

  const greeting = getGreeting();
  const clinicName = clinic?.clinicName ?? 'Your Clinic';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s how {clinicName} is performing
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod((v as PeriodPreset) ?? '7d')}>
          <SelectTrigger className="w-[180px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statsLoading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <StatsCard
              title="Total calls"
              value={totalCalls.toLocaleString()}
              description={statsCardPeriodPhrase(period)}
              trend={totalCalls > 0 ? { value: completedCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0, label: `${completedCalls} completed`, positive: true } : undefined}
            />
            <StatsCard
              title="Appointment rate"
              value={formatPercent(dashboardStats?.completionRate)}
              description={`Booked from calls — ${statsCardPeriodPhrase(period)}`}
              trend={dashboardStats?.completionRate != null && dashboardStats.completionRate > 50 ? { value: Math.round(dashboardStats.completionRate), label: 'Above target', positive: true } : undefined}
            />
            <StatsCard
              title="Avg duration"
              value={formatDuration(dashboardStats?.averageDurationSeconds)}
              description={statsCardPeriodPhrase(period)}
            />
            <StatsCard
              title="AI cost"
              value={formatMoney(dashboardStats?.totalCost)}
              description={`Telephony + AI — ${statsCardPeriodPhrase(period)}`}
            />
          </>
        )}
      </div>

      {/* Main Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Call Volume Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ActivityIcon className="size-4 text-primary" />
                  Call volume
                </CardTitle>
                <CardDescription>
                  {period === '24h' ? 'Hourly' : period === '1y' ? 'Weekly' : period === 'lifetime' ? 'Monthly' : 'Daily'} inbound calls
                </CardDescription>
              </div>
              {dashboardStats?.averageLatencyMs != null && (
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <ZapIcon className="size-3" />
                  {Math.round(dashboardStats.averageLatencyMs)}ms avg latency
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {hourlyLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <ChartContainer config={performanceChartConfig} className="h-[280px] w-full">
                <AreaChart data={dailyPerformance}>
                  <defs>
                    <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-calls)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-calls)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <BarXAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <Area type="monotone" dataKey="calls" fill="url(#fillCalls)" stroke="var(--color-calls)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Call Outcomes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2Icon className="size-4 text-success-foreground" />
              Call outcomes
            </CardTitle>
            <CardDescription>Status distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" />
            ) : statusEntries.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">No calls yet</div>
            ) : (
              <>
                <ChartContainer config={statusChartConfig} className="mx-auto h-[200px] w-full">
                  <PieChart>
                    <Pie data={statusEntries} dataKey="value" nameKey="status" innerRadius={50} outerRadius={78} paddingAngle={2} strokeWidth={0}>
                      {statusEntries.map((entry) => (
                        <Cell key={entry.status} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                  </PieChart>
                </ChartContainer>
                <div className="mt-3 space-y-1.5">
                  {statusEntries.map((entry) => (
                    <div key={entry.status} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-muted-foreground">{entry.label}</span>
                      </div>
                      <span className="font-medium tabular-nums">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sentiment Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SmileIcon className="size-4 text-primary" />
              Caller sentiment
            </CardTitle>
            <CardDescription>AI-detected caller mood</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statsLoading ? (
              <div className="space-y-3"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
            ) : totalSentiment === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">No sentiment data yet</div>
            ) : (
              ['positive', 'neutral', 'negative'].map((key) => {
                const count = sentimentBreakdown[key] ?? 0;
                const pct = totalSentiment > 0 ? (count / totalSentiment) * 100 : 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <SentimentIcon sentiment={key} />
                        <span className="capitalize">{key}</span>
                      </div>
                      <span className="font-medium tabular-nums">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Top Intents */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneForwardedIcon className="size-4 text-primary" />
              Top caller intents
            </CardTitle>
            <CardDescription>What patients are calling about</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : intentBreakdown.length === 0 ? (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No intent data yet</div>
            ) : (
              <ChartContainer config={intentChartConfig} className="h-[220px] w-full">
                <BarChart data={intentBreakdown} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <BarXAxis type="number" hide />
                  <YAxis type="category" dataKey="intent" tickLine={false} axisLine={false} width={120} tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity + Appointments Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Calls */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PhoneIcon className="size-4 text-primary" />
                Recent calls
              </CardTitle>
              <CardDescription>Latest AI receptionist sessions</CardDescription>
            </div>
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/calls" />}>
              View all <ArrowRightIcon className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {callsLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : recentCalls.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No calls yet — your AI receptionist is ready</div>
            ) : (
              <div className="space-y-1">
                {recentCalls.map((call) => (
                  <Link
                    key={call.id}
                    href={`/dashboard/calls/${call.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                        <PhoneIcon className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{call.callerNumber || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(call.startedAt).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusDot status={call.status} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDuration(call.durationSeconds)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="size-4 text-primary" />
                Upcoming appointments
              </CardTitle>
              <CardDescription>Next 7 days</CardDescription>
            </div>
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/appointments" />}>
              View all <ArrowRightIcon className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {!hasActiveCalendar ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CalendarIcon className="size-8 text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-medium">No calendar connected</p>
                  <p className="text-xs text-muted-foreground">Connect Google Calendar to see appointments</p>
                </div>
                <Button variant="outline" size="sm" render={<Link href="/dashboard/integrations" />}>
                  Connect
                </Button>
              </div>
            ) : upcomingLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : upcomingEvents.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No upcoming appointments</div>
            ) : (
              <div className="space-y-1">
                {upcomingEvents.slice(0, 5).map((event) => {
                  const start = new Date(event.start);
                  const end = new Date(event.end);
                  const isToday = start.toDateString() === new Date().toDateString();
                  const isTomorrow = start.toDateString() === new Date(Date.now() + 86400000).toDateString();
                  const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  const timeLabel = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} — ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                  return (
                    <div key={event.id} className={cn(
                      'flex items-center justify-between rounded-lg px-3 py-2.5',
                      isToday && 'bg-primary/5 border border-primary/10',
                    )}>
                      <div>
                        <p className="text-sm font-medium">{event.summary || 'Appointment'}</p>
                        <p className="text-xs text-muted-foreground">{dayLabel} &middot; {timeLabel}</p>
                      </div>
                      <Badge variant={event.status === 'confirmed' ? 'default' : 'outline'} className="text-xs">
                        {event.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row - System Status */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Integration Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WifiIcon className="size-4 text-primary" />
              Integrations
            </CardTitle>
            <CardDescription>Connected services</CardDescription>
          </CardHeader>
          <CardContent>
            {integrationStatuses.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <WifiIcon className="size-8 text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-medium">No integrations</p>
                  <p className="text-xs text-muted-foreground">Connect your tools to get started</p>
                </div>
                <Button variant="outline" size="sm" render={<Link href="/dashboard/integrations" />}>
                  Set up
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {integrationStatuses.map((int, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        'size-2 rounded-full',
                        int.status === 'active' ? 'bg-success' : int.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground',
                      )} />
                      <div>
                        <p className="text-sm font-medium">{int.name}</p>
                        <p className="text-xs capitalize text-muted-foreground">{int.type}</p>
                      </div>
                    </div>
                    {int.lastSyncAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(int.lastSyncAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                ))}
                <Separator />
                <Button variant="ghost" className="w-full" size="sm" render={<Link href="/dashboard/integrations" />}>
                  Manage integrations
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4 text-primary" />
              Quick actions
            </CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" size="sm" render={<Link href="/dashboard/ai-receptionist" />}>
              <ZapIcon className="size-3.5" /> Configure AI receptionist
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" size="sm" render={<Link href="/dashboard/patients" />}>
              <UsersIcon className="size-3.5" /> View patients
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" size="sm" render={<Link href="/dashboard/browser-call" />}>
              <PhoneIcon className="size-3.5" /> Make a test call
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" size="sm" render={<Link href="/dashboard/analytics" />}>
              <TrendingUpIcon className="size-3.5" /> View analytics
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" size="sm" render={<Link href="/dashboard/settings" />}>
              <ClockIcon className="size-3.5" /> Clinic settings
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* AI Performance Summary */}
      {dashboardStats && totalCalls > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                <ZapIcon className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">AI Receptionist Performance</p>
                <p className="text-xs text-muted-foreground">
                  {completedCalls} calls completed, {escalatedCalls} escalated to staff &middot; {formatPercent(dashboardStats.completionRate)} success rate
                </p>
              </div>
            </div>
            <Button size="sm" render={<Link href="/dashboard/analytics" />}>
              View detailed analytics <ArrowRightIcon className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
