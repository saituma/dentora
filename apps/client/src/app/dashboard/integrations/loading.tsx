import { Skeleton } from '@/components/ui/skeleton';

export default function IntegrationsLoading() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
