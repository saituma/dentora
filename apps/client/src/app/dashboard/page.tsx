'use client';

import Link from 'next/link';
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
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis as BarXAxis, YAxis } from 'recharts';
import { PhoneIcon, CalendarIcon, Loader2Icon } from 'lucide-react';
import { useGetDashboardStatsQuery, useGetHourlyVolumeQuery } from '@/features/analytics/analyticsApi';
import { useGetCallsQuery } from '@/features/calls/callsApi';
import { useGetIntegrationsQuery } from '@/features/integrations/integrationsApi';

const chartConfig = {
  calls: { label: 'Calls', color: 'var(--primary)' },
} satisfies ChartConfig;

export default function DashboardOverviewPage() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStatsQuery();
  const { data: hourlyData, isLoading: hourlyLoading } = useGetHourlyVolumeQuery();
  const { data: callsData, isLoading: callsLoading } = useGetCallsQuery({ limit: 5 });
  const { data: integrationsData } = useGetIntegrationsQuery();

  const recentCalls = callsData?.data ?? [];
  const hourlyVolume = hourlyData?.data ?? [];
  const hasActiveCalendar = (integrationsData?.data ?? []).some(
    (integration) =>
      integration.integrationType === 'calendar' &&
      (integration.status === 'active' || integration.isActive),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Overview</h2>
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
              description="In selected period"
            />
            <StatsCard
              title="Completion rate"
              value={`${stats?.completionRate?.toFixed(1) ?? 0}%`}
              description="Calls completed successfully"
            />
            <StatsCard
              title="Avg duration"
              value={`${Math.round((stats?.averageDurationSeconds ?? 0) / 60)}m ${(stats?.averageDurationSeconds ?? 0) % 60}s`}
              description="Average call length"
            />
            <StatsCard
              title="Total cost"
              value={`$${parseFloat(stats?.totalCost ?? '0').toFixed(2)}`}
              description="AI processing costs"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Hourly call volume</CardTitle>
            <CardDescription>Peak call times</CardDescription>
          </CardHeader>
          <CardContent>
            {hourlyLoading ? (
              <div className="flex h-[200px] items-center justify-center">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : hourlyVolume.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No call data yet
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <BarChart data={hourlyVolume}>
                  <BarXAxis
                    dataKey="hour"
                    tickLine={false}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return d.toLocaleTimeString('en-US', { hour: 'numeric' });
                    }}
                  />
                  <YAxis hide />
                  <Bar
                    dataKey="calls"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest calls</CardDescription>
          </CardHeader>
          <CardContent>
            {callsLoading ? (
              <div className="flex h-[200px] items-center justify-center">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : recentCalls.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No calls yet
              </div>
            ) : (
              <div className="space-y-3">
                {recentCalls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                        <PhoneIcon className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{call.callerNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {call.status} · {new Date(call.startedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/dashboard/calls">View</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link href="/dashboard/calls">View all calls</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/50 bg-primary/5">
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
