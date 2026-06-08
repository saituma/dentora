import type { HourlyVolume } from '@/features/analytics/types';

export const PERIOD_OPTIONS = [
  { value: '24h' as const, label: 'Last 24 hours' },
  { value: '7d' as const, label: 'Last 7 days' },
  { value: '30d' as const, label: 'Last 30 days' },
  { value: '6m' as const, label: 'Last 6 months' },
  { value: '1y' as const, label: 'Last year' },
  { value: 'lifetime' as const, label: 'Lifetime' },
];

export type PeriodPreset = (typeof PERIOD_OPTIONS)[number]['value'];

export function getDateRangeForPreset(preset: PeriodPreset): {
  startDate: string;
  endDate: string;
} {
  const end = new Date();
  const start = new Date(end);
  switch (preset) {
    case '24h':
      start.setTime(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '6m':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'lifetime':
      start.setTime(0);
      break;
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export function statsCardPeriodPhrase(preset: PeriodPreset): string {
  const map: Record<PeriodPreset, string> = {
    '24h': 'Past 24h',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '6m': 'Last 6 months',
    '1y': 'Last year',
    lifetime: 'All time',
  };
  return map[preset] ?? 'Selected period';
}

export function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatMoney(value?: string | number | null) {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '£0.00';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

export function formatPercent(value?: number | null) {
  return `${(typeof value === 'number' ? value : 0).toFixed(1)}%`;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function aggregateDailyFromHourly(hourlyRows: HourlyVolume[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of hourlyRows) {
    const parsed = new Date(row.hour);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = parsed.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + row.calls);
  }
  return map;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return x;
}

function eachCalendarDayInclusive(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function buildVolumeChartData(
  preset: PeriodPreset,
  rangeStart: Date,
  rangeEnd: Date,
  hourlyRows: HourlyVolume[],
): Array<{ label: string; calls: number }> {
  if (preset === '24h') {
    const anchor = new Date(rangeEnd);
    anchor.setMinutes(0, 0, 0);
    anchor.setMilliseconds(0);
    return Array.from({ length: 24 }, (_, i) => {
      const slotStart = new Date(anchor);
      slotStart.setHours(anchor.getHours() - (23 - i));
      const keyPrefix = slotStart.toISOString().slice(0, 13);
      const calls = hourlyRows.reduce((sum, row) => {
        const t = new Date(row.hour);
        return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 13) === keyPrefix
          ? sum + row.calls
          : sum;
      }, 0);
      return {
        label: slotStart.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        calls,
      };
    });
  }

  const dailyMap = aggregateDailyFromHourly(hourlyRows);

  if (preset === '7d') {
    const anchor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + i);
      return {
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        calls: dailyMap.get(d.toISOString().slice(0, 10)) ?? 0,
      };
    });
  }

  if (preset === '30d') {
    const anchor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + i);
      return {
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        calls: dailyMap.get(d.toISOString().slice(0, 10)) ?? 0,
      };
    });
  }

  if (preset === '6m') {
    return eachCalendarDayInclusive(rangeStart, rangeEnd).map((d) => ({
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      calls: dailyMap.get(d.toISOString().slice(0, 10)) ?? 0,
    }));
  }

  if (preset === '1y') {
    const weekMap = new Map<string, number>();
    for (const [dayKey, calls] of dailyMap) {
      const wk = startOfWeekMonday(new Date(`${dayKey}T12:00:00`))
        .toISOString()
        .slice(0, 10);
      weekMap.set(wk, (weekMap.get(wk) ?? 0) + calls);
    }
    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, calls]) => ({
        label: new Date(`${wk}T12:00:00`).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        calls,
      }));
  }

  const monthMap = new Map<string, number>();
  for (const [dayKey, calls] of dailyMap) {
    const mk = dayKey.slice(0, 7);
    monthMap.set(mk, (monthMap.get(mk) ?? 0) + calls);
  }
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mk, calls]) => {
      const [y, m] = mk.split('-');
      return {
        label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        calls,
      };
    });
}
