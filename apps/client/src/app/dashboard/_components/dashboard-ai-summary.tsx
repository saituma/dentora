import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZapIcon, ArrowRightIcon } from 'lucide-react';

interface DashboardStats {
  bookedCalls?: number;
  hangupCount?: number;
}

interface Props {
  dashboardStats: DashboardStats | undefined;
  totalCalls: number;
  completedCalls: number;
  escalatedCalls: number;
}

export function DashboardAiSummary({
  dashboardStats,
  totalCalls,
  completedCalls,
  escalatedCalls,
}: Props) {
  if (!dashboardStats || totalCalls === 0) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <ZapIcon className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">AI Receptionist Performance</p>
            <p className="text-xs text-muted-foreground">
              {completedCalls} calls completed, {escalatedCalls} escalated to staff &middot;{' '}
              {dashboardStats.bookedCalls} booked · {dashboardStats.hangupCount} hung up
            </p>
          </div>
        </div>
        <Button size="sm" render={<Link href="/dashboard/analytics" />}>
          View detailed analytics <ArrowRightIcon className="size-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}
