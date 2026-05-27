import { FormSkeleton } from '@/components/dashboard-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex gap-2">
        {[100, 90, 80, 110].map((w, i) => (
          <Skeleton key={i} className="h-9 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="rounded-xl border border-white/8 bg-black/[0.02] p-6">
        <FormSkeleton fields={6} />
      </div>
    </div>
  );
}
