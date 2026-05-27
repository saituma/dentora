import { FormSkeleton } from '@/components/dashboard-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function AiReceptionistLoading() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-white/8 bg-black/[0.02] p-6">
          <Skeleton className="h-5 w-36 mb-6" />
          <FormSkeleton fields={5} />
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-white/8 bg-black/[0.02] p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="rounded-xl border border-white/8 bg-black/[0.02] p-5 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
