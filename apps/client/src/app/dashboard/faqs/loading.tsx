import { Skeleton } from '@/components/ui/skeleton';

export default function FaqsLoading() {
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div className="space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="space-y-2 pt-2">
          <div className="flex gap-4 border-b border-black/[0.06] pb-2">
            <Skeleton className="h-4 w-[28%]" />
            <Skeleton className="h-4 w-[42%]" />
            <Skeleton className="h-4 w-[18%]" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-2" style={{ opacity: 1 - i * 0.12 }}>
              <Skeleton className="h-4 w-[28%]" />
              <Skeleton className="h-4 w-[42%]" />
              <Skeleton className="h-4 w-[18%]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
