import { TableSkeleton } from '@/components/dashboard-skeleton';

export default function PatientsLoading() {
  return (
    <div className="space-y-4 animate-fade-up">
      <TableSkeleton rows={8} />
    </div>
  );
}
