export type LocalDate = string & { readonly __brand: "LocalDate" };
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type QuietHours = { on: boolean; startHour: number; endHour: number };

type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: IsoWeekday;
};

const isoWeekdays: Record<string, IsoWeekday> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

function partsAt(ms: number, tz: string): ZoneParts {
  const p: Record<string, string> = {};
  for (const { type, value } of formatter(tz).formatToParts(ms)) {
    p[type] = value;
  }
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: isoWeekdays[p.weekday],
  };
}

function dateAtUtcMidnight(utcMs: number): LocalDate {
  return new Date(utcMs).toISOString().slice(0, 10) as LocalDate;
}

function offsetMs(ms: number, tz: string): number {
  const p = partsAt(ms, tz);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

export function localDate(ms: number, tz: string): LocalDate {
  const p = partsAt(ms, tz);
  return dateAtUtcMidnight(Date.UTC(p.year, p.month - 1, p.day));
}

export function localHour(ms: number, tz: string): number {
  return partsAt(ms, tz).hour;
}

export function weekday(ms: number, tz: string): IsoWeekday {
  return partsAt(ms, tz).weekday;
}

export function isWeekend(ms: number, tz: string): boolean {
  return weekday(ms, tz) >= 6;
}

export function weekStart(ms: number, tz: string): LocalDate {
  const p = partsAt(ms, tz);
  return dateAtUtcMidnight(
    Date.UTC(p.year, p.month - 1, p.day - (p.weekday - 1)),
  );
}

const DAY_MS = 86_400_000;

export function startOfLocalDayMs(ms: number, tz: string): number {
  const day = localDate(ms, tz);
  const midnightAsUtc = Date.parse(day);
  const candidates = [
    midnightAsUtc - offsetMs(midnightAsUtc - DAY_MS, tz),
    midnightAsUtc - offsetMs(midnightAsUtc + DAY_MS, tz),
  ].filter((at) => localDate(at, tz) === day);
  return Math.min(...candidates);
}

export function isTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch (e) {
    if (e instanceof RangeError) return false;
    throw e;
  }
}

export function inQuietHours(ms: number, tz: string, q: QuietHours): boolean {
  if (!q.on || q.startHour === q.endHour) return false;
  const { hour } = partsAt(ms, tz);
  return q.startHour < q.endHour
    ? q.startHour <= hour && hour < q.endHour
    : hour >= q.startHour || hour < q.endHour;
}

const QUARTER_HOUR_MS = 900_000;

export function quietHoursEnd(ms: number, tz: string, q: QuietHours): number {
  if (!inQuietHours(ms, tz, q)) return ms;
  let at = Math.floor(ms / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
  do at += QUARTER_HOUR_MS;
  while (inQuietHours(at, tz, q));
  return at;
}
