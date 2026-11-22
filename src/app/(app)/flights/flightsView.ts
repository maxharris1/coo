import { positionAt } from "@/lib/flight/engine";
import { clockTime, distance, duration, type Units } from "@/lib/format";
import { startOfLocalDayMs } from "@/lib/game/time";
import type { FlightSections } from "@/server/services/flights/list";
import type { Flight } from "@/server/services/flights/shape";

export type RowState =
  "scheduled" | "flying" | "roosting" | "delayed" | "almostHere" | "landed";
export type ChipTone = "card" | "sun" | "lilac" | "tomato" | "mint";
export type FlightsRow = {
  id: string;
  flight: Flight;
  state: RowState;
  title: string;
  line: string;
  chip?: { text: string; tone: ChipTone };
  frac: number;
};
export type FlightsSection = {
  key: keyof FlightSections;
  title: string;
  rows: FlightsRow[];
};
export type FlightsView = { pill: string; sections: FlightsSection[] };

type Copy = {
  place?: string;
  lands: string;
  left: string;
  leaves: string;
  trip: string;
};

const sill = (c: Copy) => `Lands on your sill in ${c.left}.`;
const sentences = (...parts: (string | false | undefined)[]) =>
  parts.filter(Boolean).join(" ");

const STATES: Record<
  RowState,
  {
    chip?: { text: string; tone: ChipTone };
    line: (c: Copy) => string;
    incomingLine?: (c: Copy) => string;
  }
> = {
  scheduled: {
    chip: { text: "Scheduled", tone: "card" },
    line: (c) => `Takes off ${c.leaves}.`,
  },
  flying: {
    chip: { text: "Flying", tone: "sun" },
    line: (c) => sentences(c.place && `Over ${c.place}.`, `Lands ${c.lands}.`),
    incomingLine: sill,
  },
  almostHere: { chip: { text: "Almost here", tone: "mint" }, line: sill },
  roosting: {
    chip: { text: "Roosting", tone: "lilac" },
    line: (c) =>
      sentences(c.place && `Asleep near ${c.place}.`, `Lands ${c.lands}.`),
  },
  delayed: {
    chip: { text: "Delayed", tone: "tomato" },
    line: (c) => sentences(c.place && `Last seen near ${c.place}.`),
  },
  landed: { line: (c) => c.trip },
};

const TITLES: Record<keyof FlightSections, string> = {
  yours: "Your birds",
  incoming: "Coming to you",
  landedToday: "Landed today",
};

const landedByPlan = (f: Flight, nowMs: number): boolean =>
  f.plan !== undefined &&
  positionAt(f.plan, f.from, f.to, nowMs).state === "landed";

const headingToViewer = (f: Flight): boolean =>
  (f.role === "incoming") !== (f.kind === "return");

const landsOnSill = (f: Flight): boolean =>
  f.role === "incoming" && f.kind === "delivery";

const landedAtMs = (f: Flight): number =>
  f.plan?.arriveAtMs ?? f.arriveAt ?? f.releaseAt;

function liveState(
  f: Flight,
  nowMs: number,
): { state: RowState; frac: number } {
  if (!f.plan) return { state: "scheduled", frac: 0 };
  const { state, frac } = positionAt(f.plan, f.from, f.to, nowMs);
  if (state === "waiting") return { state: "scheduled", frac };
  if (state === "flying" && landsOnSill(f) && frac >= 0.9) {
    return { state: "almostHere", frac };
  }
  return { state, frac };
}

function rowTitle(f: Flight, landed: boolean, units: Units): string {
  const toward = headingToViewer(f);
  const other =
    f.role === "incoming"
      ? f.owner.name
      : (f.counterpart?.name ??
        f.guestName ??
        (toward ? f.from.label : f.to.label));
  const who = `${f.bird.name} ${toward ? "from" : "to"} ${other}`;
  if (!landed) return who;
  const miles = f.distanceMi ?? f.plan?.distanceMi ?? 0;
  return `${who}, ${distance(miles, units)}`;
}

function copyOf(
  f: Flight,
  frac: number,
  nowMs: number,
  timezone: string,
): Copy {
  const arrive = landedAtMs(f);
  return {
    place: f.placeNames.deciles?.[Math.round(frac * 10)] ?? undefined,
    lands: clockTime(new Date(arrive), timezone),
    left: duration(Math.max(0, arrive - nowMs)),
    leaves: clockTime(new Date(f.releaseAt), timezone),
    trip: duration(arrive - f.releaseAt),
  };
}

function toRow(
  f: Flight,
  landed: boolean,
  nowMs: number,
  timezone: string,
  units: Units,
): FlightsRow {
  const { state, frac } = landed
    ? { state: "landed" as const, frac: 1 }
    : liveState(f, nowMs);
  const entry = STATES[state];
  const line = (landsOnSill(f) && entry.incomingLine) || entry.line;
  return {
    id: f.id,
    flight: f,
    state,
    title: rowTitle(f, landed, units),
    line: line(copyOf(f, frac, nowMs, timezone)),
    chip: entry.chip,
    frac,
  };
}

export function flightsView(
  page: FlightSections,
  nowMs: number,
  timezone: string,
  units: Units,
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
    sections: keys.map((key) => ({
      key,
      title: TITLES[key],
      rows: rows[key].map((f) =>
        toRow(f, key === "landedToday", nowMs, timezone, units),
      ),
    })),
  };
}
