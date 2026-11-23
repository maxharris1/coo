import { positionAt } from "@/lib/flight/engine";
import { distance, duration, fuzzyWhen, type Units } from "@/lib/format";
import { startOfLocalDayMs } from "@/lib/game/time";
import type { FlightSections } from "@/server/services/flights/list";
import type { Flight } from "@/server/services/flights/shape";

export type RowState =
  "scheduled" | "flying" | "roosting" | "delayed" | "almostHere" | "landed";
export type ChipTone = "card" | "sun" | "lilac" | "tomato" | "mint";
export type Direction = "sent" | "received";
export type FlightsRow = {
  id: string;
  flight: Flight;
  state: RowState;
  bird: string;
  other: string;
  direction: Direction;
  title: string;
  line: string;
  label: string;
  chip?: { text: string; tone: ChipTone };
};
export type SectionKey = "inTheAir" | "landedToday";
export type FlightsSection = {
  key: SectionKey;
  title: string;
  rows: FlightsRow[];
};
export type FlightsView = { pill: string; sections: FlightsSection[] };

type Copy = {
  place?: string;
  lands: string;
  leaves: string;
  trip: string;
};

const sill = (c: Copy) => `Lands on your sill ${c.lands}.`;
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
    line: (c) =>
      sentences(c.place && `Last seen near ${c.place}.`, `Lands ${c.lands}.`),
  },
  landed: { line: (c) => c.trip },
};

const TITLES: Record<SectionKey, string> = {
  inTheAir: "In the air",
  landedToday: "Landed today",
};

const DIRECTION: Record<Flight["role"], Direction> = {
  mine: "sent",
  incoming: "received",
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

function otherParty(f: Flight): { other: string; heading: string } {
  const toward = headingToViewer(f);
  const other =
    f.role === "incoming"
      ? f.owner.name
      : (f.counterpart?.name ??
        f.guestName ??
        (toward ? f.from.label : f.to.label));
  return { other, heading: `${toward ? "from" : "to"} ${other}` };
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
    lands: fuzzyWhen(arrive, nowMs, timezone),
    leaves: fuzzyWhen(f.releaseAt, nowMs, timezone),
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
  const lineOf = (landsOnSill(f) && entry.incomingLine) || entry.line;
  const line = lineOf(copyOf(f, frac, nowMs, timezone));
  const { other, heading } = otherParty(f);
  const who = `${f.bird.name} ${heading}`;
  const miles = f.distanceMi ?? f.plan?.distanceMi ?? 0;
  const named = [f.bird.name, entry.chip?.text, heading].filter(Boolean);
  return {
    id: f.id,
    flight: f,
    state,
    bird: f.bird.name,
    other,
    direction: DIRECTION[f.role],
    title: landed ? `${who}, ${distance(miles, units)}` : who,
    line,
    label: sentences(`${named.join(", ")}.`, line),
    chip: entry.chip,
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
  const yours = stillOut(page.yours);
  const incoming = stillOut(page.incoming);
  const rows: Record<SectionKey, Flight[]> = {
    inTheAir: [...yours, ...incoming],
    landedToday,
  };
  const keys = Object.keys(TITLES) as SectionKey[];
  return {
    pill:
      yours.length + incoming.length === 0
        ? "All home"
        : `${yours.length} out, ${incoming.length} coming in`,
    sections: keys.map((key) => ({
      key,
      title: TITLES[key],
      rows: rows[key].map((f) =>
        toRow(f, key === "landedToday", nowMs, timezone, units),
      ),
    })),
  };
}

export function earlierRows(
  flights: Flight[],
  nowMs: number,
  timezone: string,
  units: Units,
): FlightsRow[] {
  return flights.map((f) => {
    const row = toRow(f, true, nowMs, timezone, units);
    return f.status === "cancelled" ? { ...row, line: "Cancelled" } : row;
  });
}
