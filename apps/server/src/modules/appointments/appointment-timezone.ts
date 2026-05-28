export function getTimezoneFormatterParts(date: Date, timezone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }
  return parts;
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = getTimezoneFormatterParts(date, timezone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export function makeDateInTimeZone(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const seed = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimeZoneOffsetMs(seed, timezone);
  return new Date(seed.getTime() - offset);
}

export function formatDateInTimeZone(date: Date, timezone: string): string {
  const parts = getTimezoneFormatterParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatTimeInTimeZone(date: Date, timezone: string): string {
  const parts = getTimezoneFormatterParts(date, timezone);
  return `${parts.hour}:${parts.minute}`;
}
