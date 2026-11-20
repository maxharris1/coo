import { describe, expect, it } from "vitest";
import {
  inQuietHours,
  isTimeZone,
  isWeekend,
  localDate,
  startOfLocalDayMs,
  weekday,
  weekStart,
} from "@/lib/game/time";

const HOUR = 3_600_000;
const NY = "America/New_York";
const TOKYO = "Asia/Tokyo";
const night = { on: true, startHour: 22, endHour: 7 };
const afternoon = { on: true, startHour: 13, endHour: 15 };

function nyEst(y: number, mo: number, d: number, h: number, mi = 0): number {
  return Date.UTC(y, mo - 1, d, h + 5, mi);
}

function nyEdt(y: number, mo: number, d: number, h: number, mi = 0): number {
  return Date.UTC(y, mo - 1, d, h + 4, mi);
}

describe("local day", () => {
  it("keeps both sides of the spring-forward gap on one local date", () => {
    expect(localDate(nyEst(2026, 3, 8, 1, 59), NY)).toBe("2026-03-08");
    expect(localDate(nyEdt(2026, 3, 8, 3, 0), NY)).toBe("2026-03-08");
  });

  it("starts the day at local midnight, 23 hours long in spring and 25 in fall", () => {
    const mar8 = nyEdt(2026, 3, 8, 12);
    expect(startOfLocalDayMs(mar8, NY)).toBe(nyEst(2026, 3, 8, 0));
    expect(
      startOfLocalDayMs(mar8 + 24 * HOUR, NY) - startOfLocalDayMs(mar8, NY),
    ).toBe(23 * HOUR);
    const nov1 = nyEst(2026, 11, 1, 12);
    expect(startOfLocalDayMs(nov1, NY)).toBe(nyEdt(2026, 11, 1, 0));
    expect(
      startOfLocalDayMs(nov1 + 24 * HOUR, NY) - startOfLocalDayMs(nov1, NY),
    ).toBe(25 * HOUR);
  });

  it("starts a day whose midnight repeats at the first midnight", () => {
    const havana = "America/Havana";
    const early = Date.parse("2026-11-01T04:30Z");
    const late = Date.parse("2026-11-01T17:00Z");
    expect(localDate(early, havana)).toBe(localDate(late, havana));
    expect(startOfLocalDayMs(early, havana)).toBe(
      Date.parse("2026-11-01T04:00Z"),
    );
    expect(startOfLocalDayMs(late, havana)).toBe(
      Date.parse("2026-11-01T04:00Z"),
    );
  });

  it("starts a day whose midnight is skipped at its first instant", () => {
    const havana = "America/Havana";
    const noon = Date.parse("2026-03-08T16:00Z");
    expect(startOfLocalDayMs(noon, havana)).toBe(
      Date.parse("2026-03-08T05:00Z"),
    );
  });

  it("maps every instant of a local date to that date's first instant", () => {
    const from = Date.UTC(2026, 0, 1);
    for (const tz of [
      NY,
      "America/Havana",
      "America/Santiago",
      "Asia/Beirut",
    ]) {
      const starts = new Map<string, number>();
      for (let at = from; at < from + 366 * 24 * HOUR; at += 30 * 60_000) {
        const day = localDate(at, tz);
        const start = startOfLocalDayMs(at, tz);
        expect(starts.get(day) ?? start).toBe(start);
        starts.set(day, start);
        expect(localDate(start, tz)).toBe(day);
        expect(localDate(start - 1, tz)).not.toBe(day);
      }
    }
  });

  it("starts the week on the local Monday", () => {
    expect(weekStart(nyEdt(2026, 3, 8, 12), NY)).toBe("2026-03-02");
    expect(weekStart(nyEdt(2026, 3, 9, 0, 30), NY)).toBe("2026-03-09");
    expect(weekStart(nyEdt(2026, 3, 9, 23, 59), NY)).toBe("2026-03-09");
  });

  it("reads Saturday in Tokyo while UTC is still on Friday", () => {
    const at = Date.UTC(2026, 10, 20, 23);
    expect(weekday(at, TOKYO)).toBe(6);
    expect(localDate(at, TOKYO)).toBe("2026-11-21");
    expect(isWeekend(at, TOKYO)).toBe(true);
  });

  it("reads Friday in New York while UTC is already on Saturday", () => {
    const at = Date.UTC(2026, 10, 21, 3);
    expect(weekday(at, NY)).toBe(5);
    expect(localDate(at, NY)).toBe("2026-11-20");
    expect(isWeekend(at, NY)).toBe(false);
  });

  it("numbers Monday 1 through Sunday 7", () => {
    const days = [16, 17, 18, 19, 20, 21, 22].map((d) =>
      weekday(Date.UTC(2026, 10, d, 12), "UTC"),
    );
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("inQuietHours", () => {
  it("wraps midnight when the start is later than the end", () => {
    expect(inQuietHours(nyEst(2026, 11, 19, 22), NY, night)).toBe(true);
    expect(inQuietHours(nyEst(2026, 11, 19, 23, 30), NY, night)).toBe(true);
    expect(inQuietHours(nyEst(2026, 11, 20, 6, 59), NY, night)).toBe(true);
    expect(inQuietHours(nyEst(2026, 11, 20, 7), NY, night)).toBe(false);
    expect(inQuietHours(nyEst(2026, 11, 19, 21, 59), NY, night)).toBe(false);
  });

  it("covers a range inside one day", () => {
    expect(inQuietHours(nyEst(2026, 11, 19, 13), NY, afternoon)).toBe(true);
    expect(inQuietHours(nyEst(2026, 11, 19, 14, 59), NY, afternoon)).toBe(true);
    expect(inQuietHours(nyEst(2026, 11, 19, 15), NY, afternoon)).toBe(false);
    expect(inQuietHours(nyEst(2026, 11, 19, 12, 59), NY, afternoon)).toBe(
      false,
    );
  });

  it("is never quiet when off or when start equals end", () => {
    const at = nyEst(2026, 11, 19, 23);
    expect(inQuietHours(at, NY, { ...night, on: false })).toBe(false);
    expect(inQuietHours(at, NY, { on: true, startHour: 23, endHour: 23 })).toBe(
      false,
    );
  });

  it("reads the local hour on a DST day", () => {
    expect(inQuietHours(nyEdt(2026, 3, 8, 6, 59), NY, night)).toBe(true);
    expect(inQuietHours(nyEdt(2026, 3, 8, 7), NY, night)).toBe(false);
    expect(inQuietHours(nyEst(2026, 11, 1, 6, 59), NY, night)).toBe(true);
    expect(inQuietHours(nyEst(2026, 11, 1, 7), NY, night)).toBe(false);
  });
});

describe("isTimeZone", () => {
  it("accepts IANA zones and rejects unknown ones", () => {
    expect(isTimeZone(NY)).toBe(true);
    expect(isTimeZone("Not/AZone")).toBe(false);
  });
});

it("gives equal outputs for equal inputs across a year", () => {
  const start = Date.UTC(2026, 0, 1);
  for (const tz of [NY, TOKYO, "Australia/Lord_Howe"]) {
    for (let i = 0; i < 200; i++) {
      const at = start + i * 43 * HOUR + i * 61_000;
      const run = () => [
        localDate(at, tz),
        weekday(at, tz),
        isWeekend(at, tz),
        weekStart(at, tz),
        startOfLocalDayMs(at, tz),
        inQuietHours(at, tz, night),
      ];
      expect(run()).toEqual(run());
      expect(localDate(startOfLocalDayMs(at, tz), tz)).toBe(localDate(at, tz));
      expect(startOfLocalDayMs(at, tz)).toBeLessThanOrEqual(at);
    }
  }
});
