import { describe, expect, it } from "vitest";
import type { FlightInput, FlightPlan, Segment, WeatherSample } from "@/lib/flight/engine";
import {
  bathDone,
  careAt,
  feed,
  napDone,
  projectCare,
  settleFlight,
  snack,
  type CareSnapshot,
} from "@/lib/game/care";
import type { BreedId, GearId } from "@/lib/game/types";

const HOUR = 3_600_000;
const NOON = Date.UTC(2026, 10, 19, 17, 0);
const noBath = { hasBirdbath: false };
const withBath = { hasBirdbath: true };

function bird(over: Partial<CareSnapshot> = {}): CareSnapshot {
  return {
    belly: 80,
    feathers: 80,
    energy: 100,
    careAtMs: NOON,
    lastFedAtMs: NOON,
    hungryNotified: false,
    status: "home",
    ...over,
  };
}

const dry: WeatherSample = { windMph: 0, windFromDeg: 0, tempF: 55, precipMmH: 0, snow: false };
const rain: WeatherSample = { ...dry, precipMmH: 1 };

function flight(opts: {
  segments: Array<[Segment["kind"], number]>;
  breed?: BreedId;
  gear?: GearId[];
  weather?: [WeatherSample, WeatherSample, WeatherSample];
}): { plan: FlightPlan; input: FlightInput } {
  let at = NOON;
  const segments: Segment[] = opts.segments.map(([kind, hours]) => {
    const s = { kind, startMs: at, endMs: at + hours * HOUR, fromFrac: 0, toFrac: 1 };
    at = s.endMs;
    return s;
  });
  const input: FlightInput = {
    flightId: "f-1",
    from: { lat: 40.7, lon: -73.9 },
    to: { lat: 39.95, lon: -75.16 },
    departAtMs: NOON,
    bird: {
      speedMph: 45,
      focus: 2,
      navigation: 4,
      breed: opts.breed ?? "city",
      level: 1,
      belly: 80,
      feathers: 80,
      energy: 100,
      sulking: false,
    },
    gear: opts.gear ?? [],
    weather: opts.weather ?? [dry, dry, dry],
  };
  const plan: FlightPlan = {
    distanceMi: 81,
    bearingDeg: 240,
    onTimeOdds: 0.9,
    delayed: false,
    delayKind: "none",
    arriveAtMs: at,
    segments,
    events: [],
  };
  return { plan, input };
}

const flying = bird({ status: "flying" });

describe("careAt", () => {
  it("reads belly 80 thirty-three hours later as 14 and hungry", () => {
    const c = careAt(bird(), NOON + 33 * HOUR, noBath);
    expect(c.belly).toBe(14);
    expect(c.hungry).toBe(true);
  });

  it("drains feathers half as fast with the birdbath", () => {
    expect(careAt(bird(), NOON + 10 * HOUR, noBath).feathers).toBe(70);
    expect(careAt(bird(), NOON + 10 * HOUR, withBath).feathers).toBe(75);
  });

  it("sulks after 72 hours unfed, and feeding clears it", () => {
    const later = NOON + 72 * HOUR;
    expect(careAt(bird(), later - 1, noBath).sulking).toBe(false);
    expect(careAt(bird(), later, noBath).sulking).toBe(true);
    const fed = feed(bird(), later, noBath);
    expect(careAt(fed, later, noBath).sulking).toBe(false);
  });

  it("refuses to fly under 15 energy", () => {
    const away = { status: "visiting" as const };
    expect(careAt(bird({ ...away, energy: 14.9 }), NOON, noBath).canFly).toBe(false);
    expect(careAt(bird({ ...away, energy: 15 }), NOON, noBath).canFly).toBe(true);
  });

  it("flags scruffy under 30 feathers and tired under 40 energy", () => {
    const c = careAt(bird({ status: "flying", feathers: 29.9, energy: 39.9 }), NOON, noBath);
    expect(c).toMatchObject({ scruffy: true, tired: true, hungry: false });
    const ok = careAt(bird({ status: "flying", feathers: 30, energy: 40 }), NOON, noBath);
    expect(ok).toMatchObject({ scruffy: false, tired: false });
  });

  it("restores energy at home, scheduled and busy, and freezes it away", () => {
    const low = { energy: 20 };
    for (const status of ["home", "scheduled", "busy"] as const) {
      expect(careAt(bird({ ...low, status }), NOON + 2 * HOUR, noBath).energy).toBe(40);
    }
    for (const status of ["flying", "visiting"] as const) {
      expect(careAt(bird({ ...low, status }), NOON + 2 * HOUR, noBath).energy).toBe(20);
    }
  });

  it("clamps to 0..100 and rounds to a tenth", () => {
    const c = careAt(bird({ energy: 95 }), NOON + 100 * HOUR, noBath);
    expect(c).toMatchObject({ belly: 0, feathers: 0, energy: 100 });
    expect(careAt(bird(), NOON + HOUR / 3, noBath).belly).toBe(79.3);
  });

  it("never drains before the snapshot time", () => {
    expect(careAt(bird(), NOON - 5 * HOUR, noBath)).toMatchObject({ belly: 80, feathers: 80 });
  });
});

describe("feed, snack, bath and nap", () => {
  it("feeds +50 belly at the time given and resets the hungry flag", () => {
    const fed = feed(bird({ hungryNotified: true }), NOON + 33 * HOUR, noBath);
    expect(fed).toMatchObject({
      belly: 64,
      careAtMs: NOON + 33 * HOUR,
      lastFedAtMs: NOON + 33 * HOUR,
      hungryNotified: false,
    });
  });

  it("snacks +40 belly without counting as feeding", () => {
    const s = snack(bird({ belly: 70, hungryNotified: true }), NOON, noBath);
    expect(s).toMatchObject({ belly: 100, lastFedAtMs: NOON, hungryNotified: true });
    expect(careAt(snack(bird(), NOON + 72 * HOUR, noBath), NOON + 72 * HOUR, noBath).sulking).toBe(true);
  });

  it("bathes feathers back to 100 and naps +50 energy", () => {
    expect(bathDone(bird({ feathers: 12 }), NOON, noBath).feathers).toBe(100);
    expect(napDone(bird({ status: "busy", energy: 20 }), NOON + HOUR / 2, noBath).energy).toBe(75);
  });
});

describe("settleFlight", () => {
  it("costs 16 energy for a 2 hour dry flight", () => {
    const { plan, input } = flight({ segments: [["fly", 2]] });
    const s = settleFlight(flying, plan, input, noBath);
    expect(s.energy).toBe(84);
    expect(s.feathers).toBe(78);
    expect(s.belly).toBe(76);
    expect(s.careAtMs).toBe(plan.arriveAtMs);
  });

  it("costs 15 feathers in the rain, unless the bird wears booties", () => {
    const wet = [dry, rain, dry] as [WeatherSample, WeatherSample, WeatherSample];
    const rainy = flight({ segments: [["fly", 2]], weather: wet });
    expect(settleFlight(flying, rainy.plan, rainy.input, noBath).feathers).toBe(63);
    const booted = flight({ segments: [["fly", 2]], weather: wet, gear: ["booties"] });
    expect(settleFlight(flying, booted.plan, booted.input, noBath).feathers).toBe(78);
  });

  it("charges a King half the energy", () => {
    const { plan, input } = flight({ segments: [["fly", 2]], breed: "king" });
    expect(settleFlight(flying, plan, input, noBath).energy).toBe(92);
  });

  it("restores 5 an hour roosting and counts a delay as flown", () => {
    const { plan, input } = flight({ segments: [["fly", 1], ["roost", 4], ["delay", 1]] });
    expect(settleFlight(bird({ status: "flying", energy: 50 }), plan, input, noBath).energy).toBe(54);
  });

  it("returns the same snapshot when settled twice", () => {
    const { plan, input } = flight({ segments: [["fly", 2]], weather: [rain, rain, rain] });
    const once = settleFlight(flying, plan, input, noBath);
    expect(settleFlight(once, plan, input, noBath)).toEqual(once);
  });
});

describe("projectCare", () => {
  it("keeps energy from accruing across a status the bird was not in", () => {
    const releasedAt = NOON + 3 * HOUR;
    const atRelease = { ...projectCare(bird({ energy: 50 }), releasedAt, noBath), status: "flying" as const };
    expect(atRelease.energy).toBe(80);
    expect(careAt(atRelease, releasedAt + 2 * HOUR, noBath).energy).toBe(80);
  });
});

describe("determinism", () => {
  it("gives equal outputs for the same inputs", () => {
    const now = NOON + 33 * HOUR;
    const { plan, input } = flight({ segments: [["fly", 1], ["roost", 2]], weather: [rain, dry, dry] });
    const calls = [
      () => careAt(bird(), now, withBath),
      () => projectCare(bird(), now, withBath),
      () => feed(bird(), now, withBath),
      () => snack(bird(), now, withBath),
      () => bathDone(bird(), now, withBath),
      () => napDone(bird(), now, withBath),
      () => settleFlight(flying, plan, input, withBath),
    ];
    for (const call of calls) expect(call()).toEqual(call());
  });
});
