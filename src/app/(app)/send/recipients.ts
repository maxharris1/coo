import type { SyncPayload } from "@/components/sync";
import emptyStates from "../../../../assets/copy/empty-states.json";
import { config } from "@/lib/config";
import { computeFlightPlan, type LatLon } from "@/lib/flight/engine";
import { duration, type Units } from "@/lib/format";
import type { FriendRow } from "@/server/services/friends";
import { friendLine } from "../friends/friendsApi";

export type FlockBird = Pick<
  SyncPayload["birds"][number],
  | "canFly"
  | "speedMph"
  | "focus"
  | "navigation"
  | "breed"
  | "level"
  | "belly"
  | "feathers"
  | "energy"
  | "sulking"
  | "gear"
>;

export type Card =
  | { kind: "friend"; id: string; name: string; line: string }
  | { kind: "unreachable"; id: string; name: string; reason: string };

type From = {
  loft: LatLon | null;
  bird: FlockBird | null;
  nowMs: number;
  units: Units;
};

const RAD = Math.PI / 180;
const EARTH_MI = 3958.7613;
const EAST = 90 * RAD;
const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];
const NOBODY_RESTED = emptyStates.find(
  (s) => s.state === "No rested birds",
)!.text;

const word = (n: number) => WORDS[n] ?? String(n);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function readyBirds(birds: readonly FlockBird[]): FlockBird[] {
  return birds.filter((b) => b.canFly);
}

export function fastestReady(birds: readonly FlockBird[]): FlockBird | null {
  return readyBirds(birds).reduce<FlockBird | null>(
    (best, b) => (best && best.speedMph >= b.speedMph ? best : b),
    null,
  );
}

function eastOf(from: LatLon, miles: number): LatLon {
  const d = miles / EARTH_MI;
  const lat1 = from.lat * RAD;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(EAST),
  );
  const lon2 =
    from.lon * RAD +
    Math.atan2(
      Math.sin(EAST) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: lat2 / RAD, lon: lon2 / RAD };
}

function estimate(
  id: string,
  miles: number,
  { loft, bird, nowMs }: { loft: LatLon; bird: FlockBird; nowMs: number },
): string {
  const calm = config.game.weather.fallback;
  const plan = computeFlightPlan({
    flightId: `estimate:${id}`,
    from: loft,
    to: eastOf(loft, miles),
    departAtMs: nowMs,
    bird,
    gear: bird.gear,
    weather: [calm, calm, calm],
    // Ends any drawn delay the moment it starts, so the estimate is the calm, on-time trip.
    delayEndOverrideMs: nowMs,
  });
  const barns = plan.segments.filter(
    (s) => s.kind === "roost" && s.fromFrac > 0,
  ).length;
  if (barns > 0) {
    const days = word(barns + 1);
    return `${days[0].toUpperCase()}${days.slice(1)} days, ${word(barns)} ${plural(barns, "barn", "barns")}.`;
  }
  const elapsed = plan.arriveAtMs - nowMs;
  if (elapsed < 60_000) {
    const seconds = Math.round(elapsed / 1000);
    return `About ${seconds} ${plural(seconds, "second", "seconds")}.`;
  }
  return `About ${duration(elapsed)}.`;
}

export function friendCard(
  friend: FriendRow,
  { loft, bird, nowMs, units }: From,
): Card {
  const { id, name, distanceMi } = friend;
  if (!loft) {
    return { kind: "unreachable", id, name, reason: "Set your loft to send." };
  }
  if (distanceMi === null) {
    return { kind: "unreachable", id, name, reason: "No loft yet." };
  }
  const where = `${friendLine(friend, units)}.`;
  const line = bird
    ? `${where} ${estimate(id, distanceMi, { loft, bird, nowMs })}`
    : where;
  return { kind: "friend", id, name, line };
}

export function runningLine(picked: number, ready: number): string {
  if (picked === 0) {
    if (ready === 0) return NOBODY_RESTED;
    return `Pick who it's for. ${ready} ${plural(ready, "bird is", "birds are")} ready.`;
  }
  const readyPart =
    ready === 0 ? "none are" : `${ready} ${plural(ready, "is", "are")}`;
  return `${picked} picked. That takes ${picked} ${plural(picked, "bird", "birds")}, and ${readyPart} ready.`;
}

export function canGoNext(picked: number, ready: number): boolean {
  return picked > 0 && picked <= ready;
}

export function nextHref(ids: readonly string[]): string {
  return `/send/write?${new URLSearchParams(ids.map((id) => ["to", id]))}`;
}
