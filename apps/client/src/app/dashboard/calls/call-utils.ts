export const statusColors: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  escalated: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  started: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  in_progress: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export function formatDuration(seconds?: number) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatMoney(value?: string | number | null) {
  if (value == null) return '—';
  const numberValue = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(numberValue)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numberValue);
}

export function formatStatusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ');
}
