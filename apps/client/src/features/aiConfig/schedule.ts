export type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type ScheduleRow = {
  enabled: boolean;
  start: string;
  end: string;
};

export type BreakableScheduleRow = ScheduleRow & {
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
};

export const WEEKDAYS: Array<{ key: WeekdayKey; label: string }> = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

export const DEFAULT_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'Europe/London', label: 'London' },
];

export const DEFAULT_SCHEDULE: Record<WeekdayKey, ScheduleRow> = {
  monday: { enabled: true, start: '09:00', end: '17:00' },
  tuesday: { enabled: true, start: '09:00', end: '17:00' },
  wednesday: { enabled: true, start: '09:00', end: '17:00' },
  thursday: { enabled: true, start: '09:00', end: '17:00' },
  friday: { enabled: true, start: '09:00', end: '17:00' },
  saturday: { enabled: false, start: '09:00', end: '13:00' },
  sunday: { enabled: false, start: '09:00', end: '13:00' },
};

export const DEFAULT_BREAKABLE_SCHEDULE: Record<WeekdayKey, BreakableScheduleRow> = {
  monday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  tuesday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  wednesday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  thursday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  friday: { enabled: true, start: '09:00', end: '17:00', hasBreak: true, breakStart: '12:30', breakEnd: '13:30' },
  saturday: { enabled: false, start: '09:00', end: '13:00', hasBreak: false, breakStart: '12:00', breakEnd: '12:30' },
  sunday: { enabled: false, start: '09:00', end: '13:00', hasBreak: false, breakStart: '12:00', breakEnd: '12:30' },
};

export function parseClosedDatesText(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function toScheduleForm(
  clinicHours?: Record<string, unknown>,
  bookingSchedule?: Record<string, unknown>,
  current?: Record<WeekdayKey, ScheduleRow>,
): Record<WeekdayKey, ScheduleRow> {
  const source = bookingSchedule ?? clinicHours ?? {};
  const base = current ?? DEFAULT_SCHEDULE;
  if (Object.keys(source).length === 0) {
    return { ...base };
  }

  const next = { ...base };
  for (const day of WEEKDAYS) {
    const rawValue = source?.[day.key];
    if (!rawValue || typeof rawValue !== 'object') {
      next[day.key] = { ...base[day.key], enabled: false };
      continue;
    }

    const entry = rawValue as { start?: unknown; end?: unknown };
    if (typeof entry.start === 'string' && typeof entry.end === 'string') {
      next[day.key] = {
        enabled: true,
        start: entry.start,
        end: entry.end,
      };
    }
  }

  return next;
}

export function toSchedulePayload(schedule: Record<WeekdayKey, ScheduleRow>): Record<string, { start: string; end: string } | null> {
  return WEEKDAYS.reduce<Record<string, { start: string; end: string } | null>>((acc, day) => {
    const value = schedule[day.key];
    acc[day.key] = value.enabled
      ? { start: value.start, end: value.end }
      : null;
    return acc;
  }, {});
}

export function toBreakableScheduleForm(
  bookingSchedule?: Record<string, unknown>,
  current?: Record<WeekdayKey, BreakableScheduleRow>,
): Record<WeekdayKey, BreakableScheduleRow> {
  const source = bookingSchedule ?? {};
  const base = current ?? DEFAULT_BREAKABLE_SCHEDULE;
  if (Object.keys(source).length === 0) {
    return { ...base };
  }

  const next = { ...base };
  for (const day of WEEKDAYS) {
    const rawValue = source[day.key];
    if (!rawValue || typeof rawValue !== 'object') {
      next[day.key] = { ...base[day.key], enabled: false, hasBreak: false };
      continue;
    }

    const entry = rawValue as {
      start?: unknown;
      end?: unknown;
      breakStart?: unknown;
      breakEnd?: unknown;
      breaks?: Array<{ start?: unknown; end?: unknown }> | unknown;
    };
    const breakEntry = Array.isArray(entry.breaks) && entry.breaks.length > 0 ? entry.breaks[0] : null;
    const breakStart =
      typeof breakEntry?.start === 'string'
        ? breakEntry.start
        : typeof entry.breakStart === 'string'
          ? entry.breakStart
          : '';
    const breakEnd =
      typeof breakEntry?.end === 'string'
        ? breakEntry.end
        : typeof entry.breakEnd === 'string'
          ? entry.breakEnd
          : '';

    if (typeof entry.start === 'string' && typeof entry.end === 'string') {
      next[day.key] = {
        enabled: true,
        start: entry.start,
        end: entry.end,
        hasBreak: Boolean(breakStart && breakEnd),
        breakStart: breakStart || base[day.key].breakStart,
        breakEnd: breakEnd || base[day.key].breakEnd,
      };
    }
  }

  return next;
}

export function toBreakableSchedulePayload(
  schedule: Record<WeekdayKey, BreakableScheduleRow>,
): Record<string, { start: string; end: string; breaks?: Array<{ start: string; end: string }> } | null> {
  return WEEKDAYS.reduce<Record<string, { start: string; end: string; breaks?: Array<{ start: string; end: string }> } | null>>(
    (acc, day) => {
      const value = schedule[day.key];
      if (!value.enabled) {
        acc[day.key] = null;
        return acc;
      }

      acc[day.key] = {
        start: value.start,
        end: value.end,
        ...(value.hasBreak && value.breakStart && value.breakEnd
          ? { breaks: [{ start: value.breakStart, end: value.breakEnd }] }
          : {}),
      };
      return acc;
    },
    {},
  );
}
