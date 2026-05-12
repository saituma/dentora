import { StatCardsSkeleton, ChartSkeleton, TableSkeleton } from '@/components/dashboard-skeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-fade-up">
      <StatCardsSkeleton count={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartSkeleton height={220} />
        </div>
        <ChartSkeleton height={220} />
      </div>
      <TableSkeleton rows={5} />
    </div>
  );
}
