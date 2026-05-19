import { StatCardsSkeleton, ChartSkeleton } from '@/components/dashboard-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6 animate-fade-up">
      <StatCardsSkeleton count={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSkeleton height={240} />
        <ChartSkeleton height={240} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-5 space-y-3"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
