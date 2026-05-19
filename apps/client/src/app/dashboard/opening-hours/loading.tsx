import { Skeleton } from '@/components/ui/skeleton';

export default function OpeningHoursLoading() {
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-[30rem]" />
      </div>
      <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="space-y-3 pt-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-3 py-2.5"
              style={{ opacity: 1 - i * 0.08 }}
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-10 rounded-full" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-9 w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}
