import type { Breed, GearId, Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import {
  clockTime,
  distance,
  duration,
  shortDistance,
  type Units,
} from "@/lib/format";
import { noteLimit } from "@/lib/game/notes";
import type { Wearer } from "@/lib/game/seeds";
import type { Factor } from "@/server/services/flights/factors";
import type { RecipientQuote } from "@/server/services/flights/quote";
import type { FriendRow } from "@/server/services/friends";
import { friendLine } from "../../friends/friendsApi";
import { fastestReady, readyBySpeed } from "../recipients";

export type SyncBird = SyncPayload["birds"][number];

export type PickState =
  | { kind: "ready" }
  | { kind: "hungry"; warning: string }
  | { kind: "blocked"; reason: string };

export type PickerOption = {
  id: string;
  name: string;
  speed: string;
  look: Look;
  breed: Breed;
  gear: readonly GearId[];
  chip: string;
  state: PickState;
  wakes: boolean;
};

export type Counter = { text: string; over: boolean };

export type Assignment = readonly { id: string; birdId: string | null }[];

type Destination = { id: string; distanceMi: number | null };

export type Overflow = { birdName: string; limit: number };

export type ComposeStats = {
  distance: string;
  flightTime: string;
  odds: string;
  forecast: string;
};

type Situation =
  | "ready"
  | "hungry"
  | "tired"
  | "nap"
  | "bath"
  | "job"
  | "busy"
  | "flying"
  | "visiting"
  | "scheduled";

const blocked = (chip: string, reason: string) => ({
  chip,
  state: { kind: "blocked", reason } as const,
});

const SITUATIONS: Record<Situation, { chip: string; state: PickState }> = {
  ready: { chip: "Ready", state: { kind: "ready" } },
  hungry: {
    chip: "Hungry",
    state: { kind: "hungry", warning: "Hungry. Can fly, but the odds drop." },
  },
  tired: blocked("Too tired", "Too tired to fly. Resting up."),
  nap: blocked("Napping", "Napping. Can't fly yet."),
  bath: blocked("Bathing", "Bathing. Can't fly yet."),
  job: blocked("On a job", "On an odd job. Can't fly yet."),
  busy: blocked("Busy", "Busy for now. Can't fly yet."),
  flying: blocked("Flying", "Out on a delivery."),
  visiting: blocked("On a sill", "On a friend's sill."),
  scheduled: blocked("Scheduled", "Waiting to leave."),
};

const BUSY: Partial<Record<string, Situation>> = {
  nap: "nap",
  bath: "bath",
  job: "job",
};

function situationOf(bird: SyncBird): Situation {
  switch (bird.status) {
    case "home":
      if (!bird.canFly) return "tired";
      return bird.hungry ? "hungry" : "ready";
    case "busy":
      return BUSY[bird.busyKind ?? ""] ?? "busy";
    default:
      return bird.status;
  }
}

export function pickerOption(bird: SyncBird): PickerOption {
  const situation = situationOf(bird);
  return {
    id: bird.id,
    name: bird.name,
    speed: `${Math.round(bird.speedMph)} mph`,
    look: bird.look as Look,
    breed: bird.breed,
    gear: bird.gear as GearId[],
    ...SITUATIONS[situation],
    wakes: situation === "nap",
  };
}

export function counter(body: string, bird: Wearer): Counter {
  const limit = noteLimit(bird);
  const length = [...body.trim()].length;
  return {
    text: `${length} of ${limit} characters`,
    over: length > limit,
  };
}

function factorText(factor: Factor, units: Units): string {
  return factor.kind === "distance"
    ? `${shortDistance(factor.distanceMi, units)} is a long way`
    : factor.text;
}

export function stats(
  leg: RecipientQuote,
  birdId: string,
  timezone: string,
  units: Units,
): ComposeStats | null {
  const quote = leg.quotes.find((q) => q.birdId === birdId);
  if (!quote) return null;
  const lands = `Lands around ${clockTime(new Date(quote.arriveAt), timezone)}.`;
  const lead = quote.factors[0];
  return {
    distance: shortDistance(leg.distanceMi, units),
    flightTime: duration(quote.durationMs),
    odds: `${Math.round(quote.odds * 100)}%`,
    forecast: lead ? `${lands} ${factorText(lead, units)}.` : lands,
  };
}

export function recipientLine(friend: FriendRow, units: Units): string {
  const { where, distanceMi } = friend;
  if (distanceMi === null) return friendLine(friend, units);
  const far = `${distance(distanceMi, units)} as the pigeon flies`;
  return where ? `${where}, ${far}` : far;
}

export function releaseBird(birds: readonly SyncBird[]): SyncBird | null {
  const fastest = fastestReady(birds);
  return birds.find((b) => b === fastest) ?? null;
}

export function canRelease(
  note: string,
  count: Counter,
  birdName: string | null,
  sending: boolean,
): boolean {
  return note.trim() !== "" && !count.over && birdName !== null && !sending;
}

const farthestFirst = (a: Destination, b: Destination) =>
  (b.distanceMi ?? -Infinity) - (a.distanceMi ?? -Infinity);

export function assignBirds(
  destinations: readonly Destination[],
  birds: readonly SyncBird[],
): Assignment {
  const fliers = readyBySpeed(birds);
  const birdOf = new Map(
    [...destinations]
      .sort(farthestFirst)
      .map((d, i) => [d.id, fliers[i]?.id ?? null]),
  );
  return destinations.map((d) => ({
    id: d.id,
    birdId: birdOf.get(d.id) ?? null,
  }));
}

export function swapBird(
  rows: Assignment,
  id: string,
  birdId: string,
): Assignment {
  const row = rows.find((r) => r.id === id);
  if (!row) return rows;
  return rows.map((r) => {
    if (r === row) return { ...r, birdId };
    if (r.birdId === birdId) return { ...r, birdId: row.birdId };
    return r;
  });
}

export function overLimit(
  note: string,
  rows: Assignment,
  birds: readonly SyncBird[],
): Overflow | null {
  let tightest: Overflow | null = null;
  for (const { birdId } of rows) {
    const bird = birds.find((b) => b.id === birdId);
    if (!bird) continue;
    const { over } = counter(note, bird);
    const limit = noteLimit(bird);
    if (over && (!tightest || limit < tightest.limit))
      tightest = { birdName: bird.name, limit };
  }
  return tightest;
}
