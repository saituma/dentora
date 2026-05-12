import { Skeleton } from '@/components/ui/skeleton';

export default function AppointmentsLoading() {
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-7 border-b border-white/[0.06]">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-3 py-3 text-center">
              <Skeleton className="h-4 w-10 mx-auto" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-white/[0.04]">
          {[2, 1, 3, 2, 1, 2, 1].map((count, col) => (
            <div key={col} className="p-2 space-y-2 min-h-[300px]">
              {Array.from({ length: count }).map((_, row) => (
                <Skeleton
                  key={row}
                  className="h-14 w-full rounded-lg"
                  style={{ opacity: 1 - row * 0.15 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
