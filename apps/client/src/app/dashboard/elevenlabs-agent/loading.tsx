import { FormSkeleton } from '@/components/dashboard-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function ElevenLabsLoading() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-6 space-y-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <FormSkeleton fields={4} />
      </div>
    </div>
  );
}
