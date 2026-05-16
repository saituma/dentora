import { Skeleton } from '@/components/ui/skeleton';

export default function ClinicLoading() {
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ))}
    </div>
  );
}
