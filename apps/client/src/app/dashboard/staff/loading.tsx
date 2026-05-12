import { TableSkeleton } from '@/components/dashboard-skeleton';

export default function StaffLoading() {
  return (
    <div className="space-y-4 animate-fade-up">
      <TableSkeleton rows={6} />
    </div>
  );
}
