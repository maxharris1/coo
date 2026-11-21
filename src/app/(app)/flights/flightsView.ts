import { positionAt } from "@/lib/flight/engine";
import { startOfLocalDayMs } from "@/lib/game/time";
import type { FlightSections } from "@/server/services/flights/list";
import type { Flight } from "@/server/services/flights/shape";

export type FlightsSection = {
  key: keyof FlightSections;
  title: string;
  rows: Flight[];
};
export type FlightsView = { pill: string; sections: FlightsSection[] };

const TITLES: Record<keyof FlightSections, string> = {
  yours: "Your birds",
  incoming: "Coming to you",
  landedToday: "Landed today",
};

const landedByPlan = (f: Flight, nowMs: number): boolean =>
  f.plan !== undefined &&
  positionAt(f.plan, f.from, f.to, nowMs).state === "landed";

const landedAtMs = (f: Flight): number =>
  f.plan?.arriveAtMs ?? f.arriveAt ?? f.releaseAt;

export function flightsView(
  page: FlightSections,
  nowMs: number,
  timezone: string,
): FlightsView {
  const midnight = startOfLocalDayMs(nowMs, timezone);
  const stillOut = (rows: Flight[]) =>
    rows.filter((f) => !landedByPlan(f, nowMs));
  const landedToday = [
    ...[...page.yours, ...page.incoming].filter((f) => landedByPlan(f, nowMs)),
    ...page.landedToday,
  ]
    .filter((f) => landedAtMs(f) >= midnight)
    .sort((a, b) => landedAtMs(b) - landedAtMs(a));
  const rows: FlightSections = {
    yours: stillOut(page.yours),
    incoming: stillOut(page.incoming),
    landedToday,
  };
  const keys = Object.keys(TITLES) as (keyof FlightSections)[];
  return {
    pill: `${rows.yours.length} out, ${rows.incoming.length} coming in`,
    sections: keys.map((key) => ({ key, title: TITLES[key], rows: rows[key] })),
  };
}
