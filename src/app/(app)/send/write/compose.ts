import type { SyncPayload } from "@/components/sync";
import { clockTime, distance, duration, type Units } from "@/lib/format";
import { noteLimit } from "@/lib/game/notes";
import type { Wearer } from "@/lib/game/seeds";
import type { RecipientQuote } from "@/server/services/flights/quote";

export type SyncBird = SyncPayload["birds"][number];

export type PickState =
  | { kind: "ready" }
  | { kind: "hungry"; warning: string }
  | { kind: "blocked"; reason: string };

export type PickerOption = {
  id: string;
  name: string;
  speed: string;
  chip: string;
  state: PickState;
};

export type Counter = { text: string; over: boolean };

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

const KM_PER_MILE = 1.609344;
const CLOSE_BELOW = 0.5;

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
  return {
    id: bird.id,
    name: bird.name,
    speed: `${Math.round(bird.speedMph)} mph`,
    ...SITUATIONS[situationOf(bird)],
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

function tripDistance(miles: number, units: Units): string {
  const local = units === "km" ? miles * KM_PER_MILE : miles;
  if (local < CLOSE_BELOW) return distance(miles, units);
  return `${Math.round(local)} ${units}`;
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
    distance: tripDistance(leg.distanceMi, units),
    flightTime: duration(quote.durationMs),
    odds: `${Math.round(quote.odds * 100)}%`,
    forecast: lead ? `${lands} ${lead.text}.` : lands,
  };
}
