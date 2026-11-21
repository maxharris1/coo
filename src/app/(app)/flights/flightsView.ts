import { positionAt, type FlightPlan } from "@/lib/flight/engine";
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

type Planned = Flight & { plan: FlightPlan };

const landedByPlan = (f: Flight, nowMs: number): f is Planned =>
  f.plan !== undefined &&
  positionAt(f.plan, f.from, f.to, nowMs).state === "landed";

export function flightsView(page: FlightSections, nowMs: number): FlightsView {
  const stillOut = (rows: Flight[]) =>
    rows.filter((f) => !landedByPlan(f, nowMs));
  const moved = [...page.yours, ...page.incoming]
    .filter((f) => landedByPlan(f, nowMs))
    .sort((a, b) => b.plan.arriveAtMs - a.plan.arriveAtMs);
  const rows: FlightSections = {
    yours: stillOut(page.yours),
    incoming: stillOut(page.incoming),
    landedToday: [...moved, ...page.landedToday],
  };
  const keys = Object.keys(TITLES) as (keyof FlightSections)[];
  return {
    pill: `${rows.yours.length} out, ${rows.incoming.length} coming in`,
    sections: keys.map((key) => ({ key, title: TITLES[key], rows: rows[key] })),
  };
}
