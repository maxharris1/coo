import { positionAt } from "@/lib/flight/engine";
import { distance, duration, fuzzyWhen, type Units } from "@/lib/format";
import { localDate, startOfLocalDayMs, weekStart } from "@/lib/game/time";
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
  testHop: boolean;
};
export type SectionKey = "inTheAir" | "landedToday";
export type FlightsSection = {
  key: SectionKey;
  title: string;
  rows: FlightsRow[];
};
export type FlightsView = { pill: string; sections: FlightsSection[] };
export type GroupKey = "today" | "yesterday" | "week" | "earlier";
export type PastGroup = {
  key: GroupKey;
  title: string;
  rows: FlightsRow[];
  testHops: FlightsRow[];
};

type Copy = {
  place?: string;
  lands: string;
  leaves: string;
  trip: string;
  far: string;
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
  landed: { line: (c) => `${c.far} · ${c.trip}` },
};

const TITLES: Record<SectionKey, string> = {
  inTheAir: "In the air",
  landedToday: "Landed today",
};

const GROUP_TITLES: Record<GroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  earlier: "Earlier",
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

const milesOf = (f: Flight): number | undefined =>
  f.distanceMi ?? f.plan?.distanceMi;

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
  units: Units,
): Copy {
  const arrive = landedAtMs(f);
  return {
    far: distance(milesOf(f) ?? 0, units),
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
  const line = lineOf(copyOf(f, frac, nowMs, timezone, units));
  const { other, heading } = otherParty(f);
  const named = [f.bird.name, entry.chip?.text, heading].filter(Boolean);
  return {
    id: f.id,
    flight: f,
    state,
    bird: f.bird.name,
    other,
    direction: DIRECTION[f.role],
    title: `${f.bird.name} · ${other}`,
    line,
    label: sentences(`${named.join(", ")}.`, line),
    chip: entry.chip,
    testHop: landed && milesOf(f) === 0,
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

function startOfWeekMs(today: number, nowMs: number, timezone: string): number {
  const monday = weekStart(nowMs, timezone);
  let midnight = today;
  while (localDate(midnight, timezone) !== monday) {
    midnight = startOfLocalDayMs(midnight - 1, timezone);
  }
  return midnight;
}

export function pastGroups(
  rows: FlightsRow[],
  nowMs: number,
  timezone: string,
): PastGroup[] {
  const today = startOfLocalDayMs(nowMs, timezone);
  const starts: [GroupKey, number][] = [
    ["today", today],
    ["yesterday", startOfLocalDayMs(today - 1, timezone)],
    ["week", startOfWeekMs(today, nowMs, timezone)],
  ];
  const groupOf = (row: FlightsRow): GroupKey =>
    starts.find(([, start]) => landedAtMs(row.flight) >= start)?.[0] ??
    "earlier";
  const keys = Object.keys(GROUP_TITLES) as GroupKey[];
  return keys
    .map((key) => {
      const all = rows.filter((row) => groupOf(row) === key);
      return {
        key,
        title: GROUP_TITLES[key],
        rows: all.filter((row) => !row.testHop),
        testHops: all.filter((row) => row.testHop),
      };
    })
    .filter((group) => group.rows.length + group.testHops.length > 0);
}

export type PastFilter = { dir: "all" | Direction; birds: ReadonlySet<string> };

export const ALL_PAST: PastFilter = { dir: "all", birds: new Set() };

export function filterPast(
  rows: FlightsRow[],
  { dir, birds }: PastFilter,
): FlightsRow[] {
  return rows.filter(
    (row) =>
      (dir === "all" || row.direction === dir) &&
      (birds.size === 0 || birds.has(row.flight.bird.id)),
  );
}

export function birdChips(rows: FlightsRow[]): { id: string; name: string }[] {
  const byId = new Map(
    rows.map((row) => [row.flight.bird.id, row.flight.bird.name]),
  );
  if (byId.size < 2) return [];
  return [...byId]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
