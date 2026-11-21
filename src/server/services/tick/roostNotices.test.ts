import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import {
  computeFlightPlan,
  type FlightInput,
  type FlightPlan,
  type LatLon,
  type Segment,
} from "@/lib/flight/engine";
import { clockTime } from "@/lib/format";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertFlyingDelivery } from "@/test/fixtures/flights";
import { seedWorld, type World } from "@/test/seedWorld";
import { tick } from "../tick";
import { roostNotices } from "./roostNotices";

const MINUTE_MS = 60_000;
const ZONE = "America/New_York";
const CHICAGO = { lat: 41.88, lon: -87.63, label: "Chicago" };
const DENVER = { lat: 39.74, lon: -104.99, label: "Denver" };
const AFTERNOON_NY = Date.UTC(2026, 10, 19, 20);
const NIGHT_NY = Date.UTC(2026, 10, 19, 7);

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

type Trip = { flightId: string; plan: FlightPlan };

async function insertTrip(
  releaseMs: number,
  to: LatLon & { label: string },
): Promise<Trip> {
  const { flightId, birdId } = await insertFlyingDelivery(
    deps.db,
    world,
    releaseMs,
  );
  const [bird] = await deps.db.query<{
    speed_mph: number;
    focus: number;
    navigation: number;
    breed: string;
    gear: string[];
  }>(
    "select speed_mph, focus, navigation, breed, gear from birds where id = $1",
    [birdId],
  );
  const [from] = await deps.db.query<{ from_lat: number; from_lon: number }>(
    "select from_lat, from_lon from flights where id = $1",
    [flightId],
  );
  const sample = config.game.weather.fallback;
  const input: FlightInput = {
    flightId,
    from: { lat: from.from_lat, lon: from.from_lon },
    to: { lat: to.lat, lon: to.lon },
    departAtMs: releaseMs,
    bird: {
      speedMph: Number(bird.speed_mph),
      focus: bird.focus,
      navigation: bird.navigation,
      breed: bird.breed,
      level: 1,
      belly: 80,
      feathers: 80,
      energy: 100,
      sulking: false,
    },
    gear: bird.gear,
    weather: [sample, sample, sample],
  };
  const plan = computeFlightPlan(input);
  await deps.db.query(
    `update flights set to_lat = $2, to_lon = $3, to_label = $4, arrive_at = $5,
       distance_mi = $6, odds = $7, delay_kind = $8, input = $9, plan = $10
     where id = $1`,
    [
      flightId,
      to.lat,
      to.lon,
      to.label,
      new Date(plan.arriveAtMs).toISOString(),
      plan.distanceMi,
      plan.onTimeOdds,
      plan.delayKind,
      JSON.stringify(input),
      JSON.stringify(plan),
    ],
  );
  return { flightId, plan };
}

function nightsAfterTakeoff(plan: FlightPlan): Segment[] {
  const firstFly = plan.segments.findIndex((s) => s.kind === "fly");
  return plan.segments.filter(
    (s, i) => s.kind === "roost" && firstFly !== -1 && i > firstFly,
  );
}

async function roostingNotices() {
  return deps.db.query<{
    user_id: string;
    ref_id: string;
    title: string;
    body: string;
    url: string;
  }>(
    "select user_id, ref_id, title, body, url from notifications where kind = 'roosting' order by created_at",
  );
}

const localDay = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(ms));

describe("roost notices", () => {
  it("scenario 3: an afternoon flight to Chicago roosts, tells Max once and lands the next day", async () => {
    const { flightId, plan } = await insertTrip(AFTERNOON_NY, CHICAGO);
    const [night] = nightsAfterTakeoff(plan);
    expect(night).toBeDefined();
    expect(plan.segments[0].kind).toBe("fly");
    expect(localDay(plan.arriveAtMs)).not.toBe(localDay(AFTERNOON_NY));

    deps.clock.set(night.startMs + MINUTE_MS);
    const first = await tick(deps);
    await tick(deps);
    deps.clock.set(night.endMs + MINUTE_MS);
    await tick(deps);

    expect(first.counts.roostNotices).toBe(1);
    const notices = await roostingNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      user_id: world.max.id,
      title: "Gerald stopped for the night",
      url: `/flights/${flightId}`,
    });
    expect(notices[0].body).toContain(
      `Back in the air at ${clockTime(new Date(night.endMs), ZONE)}.`,
    );
    const [f] = await deps.db.query<{ roosts_notified: number }>(
      "select roosts_notified from flights where id = $1",
      [flightId],
    );
    expect(f.roosts_notified).toBe(1);
  });

  it("sends nothing before the first roost starts", async () => {
    const { plan } = await insertTrip(AFTERNOON_NY, CHICAGO);
    const [night] = nightsAfterTakeoff(plan);

    deps.clock.set(night.startMs - MINUTE_MS);
    const result = await tick(deps);

    expect(result.counts.roostNotices).toBe(0);
    expect(await roostingNotices()).toEqual([]);
  });

  it("skips the wait for sunrise on a night release and tells Max once for each later night", async () => {
    const { plan } = await insertTrip(NIGHT_NY, DENVER);
    expect(plan.segments[0]).toMatchObject({ kind: "roost", fromFrac: 0 });
    const nights = nightsAfterTakeoff(plan);
    expect(nights.length).toBeGreaterThanOrEqual(2);

    deps.clock.set(plan.segments[0].startMs + 30 * MINUTE_MS);
    await tick(deps);
    expect(await roostingNotices()).toEqual([]);

    for (const [i, night] of nights.entries()) {
      deps.clock.set(night.startMs + MINUTE_MS);
      await tick(deps);
      await tick(deps);
      expect(await roostingNotices()).toHaveLength(i + 1);
    }

    const notices = await roostingNotices();
    expect(new Set(notices.map((n) => n.ref_id)).size).toBe(nights.length);
    expect(notices.map((n) => n.body)).toEqual(
      nights.map((n) =>
        expect.stringContaining(
          `Back in the air at ${clockTime(new Date(n.endMs), ZONE)}.`,
        ),
      ),
    );
  });

  it("sends one notice when two runs of the step race", async () => {
    const { plan } = await insertTrip(AFTERNOON_NY, CHICAGO);
    const [night] = nightsAfterTakeoff(plan);
    deps.clock.set(night.startMs + MINUTE_MS);
    const ctx = { deps, limit: 50, timeUp: () => false };

    const results = await Promise.all([roostNotices(ctx), roostNotices(ctx)]);

    expect(results.map((r) => r.count).sort()).toEqual([0, 1]);
    expect(await roostingNotices()).toHaveLength(1);
  });

  it("only touches the given user's flights", async () => {
    const { plan } = await insertTrip(AFTERNOON_NY, CHICAGO);
    const [night] = nightsAfterTakeoff(plan);
    deps.clock.set(night.startMs + MINUTE_MS);

    const result = await tick(deps, { userId: world.rosa.id });

    expect(result.counts.roostNotices).toBe(0);
    expect(await roostingNotices()).toEqual([]);
  });
});
