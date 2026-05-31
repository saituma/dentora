'use client';

import { useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { WifiIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useGetDashboardStatsQuery,
  useGetHourlyVolumeQuery,
} from '@/features/analytics/analyticsApi';
import { useGetCallsQuery } from '@/features/calls/callsApi';
import { useGetIntegrationsQuery } from '@/features/integrations/integrationsApi';
import { useGetUpcomingAppointmentsQuery } from '@/features/appointments/appointmentsApi';
import { useGetClinicQuery } from '@/features/clinic/clinicApi';
import { useGetTelephonyNumbersQuery } from '@/features/telephony/telephonyApi';
import { PageHeader } from '@/components/page-header';
import type { ChartConfig } from '@/components/ui/chart';

import {
  PERIOD_OPTIONS,
  type PeriodPreset,
  getDateRangeForPreset,
  buildVolumeChartData,
  getGreeting,
} from './_components/dashboard-utils';
import { DashboardKpiRow } from './_components/dashboard-kpi-row';
import { DashboardChartsRow } from './_components/dashboard-charts-row';
import { DashboardSentimentRow } from './_components/dashboard-sentiment-row';
import { DashboardActivityRow } from './_components/dashboard-activity-row';
import { DashboardSystemRow } from './_components/dashboard-system-row';
import { DashboardAiSummary } from './_components/dashboard-ai-summary';

export default function DashboardOverviewPage() {
  const [period, setPeriod] = useState<PeriodPreset>('7d');
  const dateRange = useMemo(() => getDateRangeForPreset(period), [period]);

  const { data: clinic } = useGetClinicQuery();
  const { data: integrationData } = useGetIntegrationsQuery();
  const { data: telephonyData } = useGetTelephonyNumbersQuery();

  const activeNumber = telephonyData?.data?.find((n) => n.status === 'active');
  const integrations = integrationData?.data ?? [];
  const hasActiveCalendar = integrations.some(
    (i) =>
      i.integrationType === 'calendar' && i.provider === 'google_calendar' && i.status === 'active',
  );

  const refetchOpts = {
    refetchOnFocus: true,
    refetchOnReconnect: true,
    pollingInterval: 60_000,
  } as const;

  const {
    data: dashboardStats,
    isLoading: statsLoading,
    isFetching: statsFetching,
  } = useGetDashboardStatsQuery(dateRange, refetchOpts);
  const { data: hourlyVolume, isLoading: hourlyLoading } = useGetHourlyVolumeQuery(
    dateRange,
    refetchOpts,
  );
  const { data: callsData, isLoading: callsLoading } = useGetCallsQuery({ limit: 5 }, refetchOpts);
  const { data: upcomingAppointments, isLoading: upcomingLoading } =
    useGetUpcomingAppointmentsQuery(hasActiveCalendar ? { days: 7 } : skipToken, refetchOpts);

  const rangeStart = useMemo(() => new Date(dateRange.startDate), [dateRange.startDate]);
  const rangeEnd = useMemo(() => new Date(dateRange.endDate), [dateRange.endDate]);
  const dailyPerformance = useMemo(
    () => buildVolumeChartData(period, rangeStart, rangeEnd, hourlyVolume?.data ?? []),
    [period, rangeStart, rangeEnd, hourlyVolume?.data],
  );

  const statusEntries = Object.entries(dashboardStats?.callsByStatus ?? {})
    .map(([status, count], index) => ({
      status,
      label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value: count,
      color: `var(--chart-${(index % 5) + 1})`,
    }))
    .filter((e) => e.value > 0);

  const statusChartConfig: ChartConfig = statusEntries.reduce((acc, e) => {
    acc[e.status] = { label: e.label, color: e.color };
    return acc;
  }, {} as ChartConfig);

  const totalCalls = dashboardStats?.totalCalls ?? 0;
  const completedCalls = dashboardStats?.callsByStatus?.completed ?? 0;
  const escalatedCalls = dashboardStats?.callsByStatus?.escalated ?? 0;

  const sentimentBreakdown = dashboardStats?.sentimentBreakdown ?? {};
  const totalSentiment = Object.values(sentimentBreakdown).reduce((a, b) => a + b, 0);

  const integrationStatuses = integrations.map((i) => ({
    name: i.provider.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    type: i.integrationType,
    status: i.status,
    healthStatus: i.healthStatus,
    lastSyncAt: i.lastSyncAt,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={getGreeting()}
        subtitle={`Here's how ${clinic?.clinicName ?? 'Your Clinic'} is performing`}
        actions={
          <div className="flex items-center gap-2">
            {statsFetching && !statsLoading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <WifiIcon className="size-3 animate-pulse" />
                Updating…
              </span>
            )}
            <Select value={period} onValueChange={(v) => setPeriod((v as PeriodPreset) ?? '7d')}>
              <SelectTrigger className="w-[180px]" size="sm">
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
        }
      />

      <DashboardKpiRow
        statsLoading={statsLoading}
        dashboardStats={dashboardStats}
        period={period}
      />

      <DashboardChartsRow
        statsLoading={statsLoading}
        hourlyLoading={hourlyLoading}
        period={period}
        dailyPerformance={dailyPerformance}
        averageLatencyMs={dashboardStats?.averageLatencyMs}
        statusEntries={statusEntries}
        statusChartConfig={statusChartConfig}
      />

      <DashboardSentimentRow
        statsLoading={statsLoading}
        sentimentBreakdown={sentimentBreakdown}
        totalSentiment={totalSentiment}
        intentBreakdown={dashboardStats?.topIntents ?? []}
      />

      <DashboardActivityRow
        callsLoading={callsLoading}
        recentCalls={callsData?.data ?? []}
        upcomingLoading={upcomingLoading}
        upcomingEvents={upcomingAppointments?.data?.events ?? []}
        hasActiveCalendar={hasActiveCalendar}
      />

      <DashboardSystemRow activeNumber={activeNumber} integrationStatuses={integrationStatuses} />

      <DashboardAiSummary
        dashboardStats={dashboardStats}
        totalCalls={totalCalls}
        completedCalls={completedCalls}
        escalatedCalls={escalatedCalls}
      />
    </div>
  );
}
