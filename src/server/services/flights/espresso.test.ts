import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import {
  computeFlightPlan,
  type FlightInput,
  type LatLon,
  type Segment,
} from "@/lib/flight/engine";
import { espressoUntil, withEspresso } from "./espresso";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const EAST_VILLAGE = { lat: 40.73, lon: -73.9875 };
const NEXT_DOOR = { lat: 40.7315, lon: -73.9875 };
const PHILADELPHIA = { lat: 39.952, lon: -75.165 };
const LOS_ANGELES = { lat: 34.05, lon: -118.24 };
const TEN_PM = Date.UTC(2026, 10, 20, 3);
const TEN_AM = Date.UTC(2026, 10, 19, 15);
const HOP_AT = Date.parse("2026-11-22T21:40:00Z");
const HOP_SUNRISE = Date.parse("2026-11-23T11:52:00Z");
const CALM = {
  windMph: 0,
  windFromDeg: 0,
  tempF: 55,
  precipMmH: 0,
  snow: false,
};

function flight(
  to: LatLon,
  departAtMs: number,
  gear: string[] = [],
): FlightInput {
  const bird = config.game.start.birds[0];
  return {
    flightId: "00000000-0000-4000-a000-00000000e550",
    from: EAST_VILLAGE,
    to,
    departAtMs,
    bird: {
      speedMph: bird.speedMph,
      focus: bird.focus,
      navigation: bird.navigation,
      level: 1,
      belly: 100,
      feathers: 100,
      energy: 100,
      sulking: false,
    },
    gear,
    weather: [CALM, CALM, CALM],
    hazards: { hawk: false, fair: false },
  };
}

const roosts = (input: FlightInput): Segment[] =>
  computeFlightPlan(input).segments.filter((s) => s.kind === "roost");

const roostMs = (input: FlightInput) =>
  roosts(input).reduce((sum, s) => sum + s.endMs - s.startMs, 0);

describe("espressoUntil", () => {
  it("is null for a bird in night-vision goggles", () => {
    expect(espressoUntil(flight(PHILADELPHIA, TEN_PM, ["nightgoggles"]))).toBe(
      null,
    );
  });

  it("is null for a daylight flight that never roosts", () => {
    const input = flight(PHILADELPHIA, TEN_AM);
    expect(roosts(input)).toEqual([]);
    expect(espressoUntil(input)).toBe(null);
  });

  it("ends at the loft sunrise for a hop released after dark", () => {
    const input = flight(NEXT_DOOR, HOP_AT);
    const until = espressoUntil(input);

    expect(until).toBe(roosts(input)[0].endMs);
    expect(Math.abs(until! - HOP_SUNRISE)).toBeLessThan(5 * MINUTE_MS);
  });

  it("lets the hop leave at release and land before sunrise", () => {
    const { input, used } = withEspresso(flight(NEXT_DOOR, HOP_AT));
    const plan = computeFlightPlan(input);

    expect(used).toBe(true);
    expect(plan.segments.map((s) => s.kind)).toEqual(["fly"]);
    expect(plan.arriveAtMs).toBeLessThan(HOP_AT + MINUTE_MS);
  });

  it("skips only the first night of a trip across the country", () => {
    const bare = flight(LOS_ANGELES, TEN_PM);
    const { input, used } = withEspresso(bare);
    const until = input.nightFlightUntilMs!;

    expect(used).toBe(true);
    expect(until).toBe(roosts(bare)[0].endMs);
    expect(roosts(bare)[0].startMs).toBe(TEN_PM);

    const early = roosts(input).filter((s) => s.startMs < until + HOUR_MS);
    expect(early.every((s) => s.startMs === until)).toBe(true);
    expect(early.every((s) => s.endMs - s.startMs < 2 * HOUR_MS)).toBe(true);
    expect(roosts(input).some((s) => s.startMs > until + 6 * HOUR_MS)).toBe(
      true,
    );
    expect(roostMs(input)).toBeLessThan(roostMs(bare) - 6 * HOUR_MS);
    expect(computeFlightPlan(input).arriveAtMs).toBeLessThan(
      computeFlightPlan(bare).arriveAtMs,
    );
  });

  it("leaves a flight without a roost unchanged", () => {
    const bare = flight(PHILADELPHIA, TEN_AM);
    expect(withEspresso(bare)).toEqual({ input: bare, used: false });
  });
});
