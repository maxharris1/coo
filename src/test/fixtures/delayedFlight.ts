import vectors from "../../../reference/flight-engine/vectors.json";
import type { SyncBird } from "@/app/(app)/send/write/compose";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { Flight } from "@/server/services/flights/shape";

const MAJOR = vectors.vectors.find((v) => v.name === "delay-major")!;
export const INPUT = MAJOR.input as FlightInput;
export const PLAN = MAJOR.plan as FlightPlan;
export const DELAY = PLAN.segments.find((s) => s.kind === "delay")!;
export const DURING = DELAY.startMs + 60_000;

export const syncBird = (over: Partial<SyncBird> = {}): SyncBird =>
  ({
    id: "kevin",
    name: "Kevin",
    pronoun: "he",
    detours: 4,
    breed: "city",
    speedMph: 45,
    level: 1,
    focus: 2,
    navigation: 3,
    belly: 80,
    feathers: 80,
    energy: 80,
    sulking: false,
    gear: [],
    status: "flying",
    busyKind: null,
    busyUntil: null,
    hungry: false,
    tired: false,
    canFly: false,
    ...over,
  }) as SyncBird;

export function delayedFlight(over: Partial<Flight> = {}): Flight {
  return {
    id: INPUT.flightId,
    kind: "delivery",
    status: "flying",
    bird: { id: "kevin", name: "Kevin", look: "kevin", gear: [] },
    owner: { id: "u1", name: "Max", handle: "max" },
    counterpart: { id: "theo", name: "Theo", handle: "theo" },
    from: { ...INPUT.from, label: "Brooklyn" },
    to: { ...INPUT.to, label: "Philly" },
    releaseAt: INPUT.departAtMs,
    arriveAt: PLAN.arriveAtMs,
    distanceMi: PLAN.distanceMi,
    plan: PLAN,
    input: INPUT,
    placeNames: {
      deciles: [
        "New York, NY",
        "Jersey City, NJ",
        "Trenton, NJ",
        ...Array(7).fill(null),
        "Philadelphia, PA",
      ],
      events: {},
      dest: null,
    },
    role: "mine",
    hasNote: true,
    ...over,
  };
}
