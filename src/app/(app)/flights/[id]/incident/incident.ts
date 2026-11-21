import { config } from "@/lib/config";
import {
  clockTime,
  distance,
  fill,
  type Pronoun,
  type Units,
} from "@/lib/format";
import type { Flight } from "@/server/services/flights/shape";
import { releaseBird, type SyncBird } from "../../../send/write/compose";

export type IncidentRow = {
  label: "Bird" | "Route" | "Last seen" | "Cause" | "Your note";
  value: string;
};

export type SearchState =
  | { kind: "available"; cost: number; line: string }
  | { kind: "done"; line: string }
  | { kind: "unavailable" };

export type IncidentReport = {
  reportNo: string;
  headline: string;
  sub: string;
  rows: IncidentRow[];
  place: string | null;
  search: SearchState;
  resend: { href: string; label: string } | null;
  footer: string;
};

export type IncidentContext = {
  birds: readonly SyncBird[];
  delayedCount: number;
  nowMs: number;
  timeZone: string;
  units: Units;
};

const { searchPartyCost } = config.game.seeds;
const { searchSuccessChance } = config.game.engine;
const { delay_major, delay_minor } = config.copy.flightLog;

const RESULT: Record<NonNullable<Flight["searchParty"]>, string> = {
  found: "Found {him}. Back in the air.",
  not_found: "They found a different pigeon. Sorry.",
};

const times = (n: number) => `${n} ${n === 1 ? "time" : "times"}`;

function searchState(
  flight: Flight,
  nowMs: number,
  pronoun: Pronoun,
): SearchState {
  if (flight.searchParty) {
    return {
      kind: "done",
      line: fill(RESULT[flight.searchParty], {}, pronoun),
    };
  }
  const delay = flight.plan?.segments.find((s) => s.kind === "delay");
  const open =
    flight.role === "mine" &&
    flight.plan?.delayKind === "major" &&
    delay !== undefined &&
    nowMs >= delay.startMs &&
    nowMs < delay.endMs;
  if (!open) return { kind: "unavailable" };
  const odds = Math.round(searchSuccessChance * 10);
  return {
    kind: "available",
    cost: searchPartyCost,
    line: `${searchPartyCost} seeds. ${odds} in 10 strays are back within the hour.`,
  };
}

function resendLink(flight: Flight, birds: readonly SyncBird[]) {
  const next = releaseBird(birds.filter((b) => b.id !== flight.bird.id));
  if (!next) return null;
  const href = flight.counterpart
    ? `/send/write?${new URLSearchParams({ to: flight.counterpart.id })}`
    : "/send";
  return { href, label: `Resend with ${next.name}` };
}

export function incidentReport(
  flight: Flight,
  { birds, delayedCount, nowMs, timeZone, units }: IncidentContext,
): IncidentReport | null {
  const plan = flight.plan;
  const event = plan?.events.find((e) => e.kind === "delay");
  const delay = plan?.segments.find((s) => s.kind === "delay");
  if (!plan || !event || !delay) return null;

  const name = flight.bird.name;
  const synced = birds.find((b) => b.id === flight.bird.id);
  const pronoun = (synced?.pronoun ?? "they") as Pronoun;
  const friend = flight.counterpart?.name ?? flight.guestName ?? "your friend";
  const speed = flight.input?.bird.speedMph ?? synced?.speedMph;
  const miles = flight.distanceMi ?? plan.distanceMi;
  const place =
    flight.placeNames.deciles?.[Math.round(delay.fromFrac * 10)] ?? null;
  const at = clockTime(new Date(event.atMs), timeZone);
  const causes = plan.delayKind === "major" ? delay_major : delay_minor;
  const detours = synced?.detours ?? 0;

  return {
    reportNo: String(delayedCount).padStart(4, "0"),
    headline: `${name} did not arrive`,
    sub: `Your note to ${friend} is running late. We told ${friend} a bird is on the way, eventually.`,
    rows: [
      {
        label: "Bird",
        value:
          speed === undefined
            ? `${name}.`
            : `${name}. ${Math.round(speed)} mph on a good day.`,
      },
      {
        label: "Route",
        value: `${flight.from.label} to ${flight.to.label}, ${distance(miles, units)}`,
      },
      { label: "Last seen", value: place ? `${place}, ${at}` : at },
      {
        label: "Cause",
        value: fill(
          causes[event.pick % causes.length],
          { bird: name, place: place ?? undefined },
          pronoun,
        ),
      },
      {
        label: "Your note",
        value: flight.hasNote
          ? "Still attached. Probably."
          : "Nothing attached this trip.",
      },
    ],
    place,
    search: searchState(flight, nowMs, pronoun),
    resend: resendLink(flight, birds),
    footer: fill(
      `{bird} has wandered off ${times(detours)}. {He} has come home by dusk ${times(detours)}.`,
      { bird: name },
      pronoun,
    ),
  };
}
