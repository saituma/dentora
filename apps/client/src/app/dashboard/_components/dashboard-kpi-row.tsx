import { StatsCard } from '@/components/stats-card';
import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatDuration,
  formatMoney,
  formatPercent,
  statsCardPeriodPhrase,
  type PeriodPreset,
} from './dashboard-utils';

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

interface DashboardStats {
  totalCalls?: number;
  callsByStatus?: Record<string, number>;
  bookingRate?: number;
  bookedCalls?: number;
  hangupCount?: number;
  averageDurationSeconds?: number;
  totalCost?: string | number;
}

interface Props {
  statsLoading: boolean;
  dashboardStats: DashboardStats | undefined;
  period: PeriodPreset;
}

export function DashboardKpiRow({ statsLoading, dashboardStats, period }: Props) {
  const totalCalls = dashboardStats?.totalCalls ?? 0;
  const completedCalls = dashboardStats?.callsByStatus?.completed ?? 0;
  const periodPhrase = statsCardPeriodPhrase(period);

  if (statsLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatsCard
        title="Total calls"
        value={totalCalls.toLocaleString()}
        description={periodPhrase}
        trend={
          totalCalls > 0
            ? {
                value: completedCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0,
                label: `${completedCalls} completed`,
                positive: true,
              }
            : undefined
        }
      />
      <StatsCard
        title="Booking rate"
        value={formatPercent(dashboardStats?.bookingRate)}
        description={`${dashboardStats?.bookedCalls ?? 0} appointments booked — ${periodPhrase}`}
        trend={
          dashboardStats?.hangupCount != null && dashboardStats.hangupCount > 0
            ? { value: dashboardStats.hangupCount, label: 'hung up early', positive: false }
            : undefined
        }
      />
      <StatsCard
        title="Avg duration"
        value={formatDuration(dashboardStats?.averageDurationSeconds)}
        description={periodPhrase}
      />
      <StatsCard
        title="AI cost"
        value={formatMoney(dashboardStats?.totalCost)}
        description={`Telephony + AI — ${periodPhrase}`}
      />
    </div>
  );
}
