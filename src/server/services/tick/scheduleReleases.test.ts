import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeFlightPlan,
  type FlightInput,
  type FlightPlan,
  type WeatherSample,
} from "@/lib/flight/engine";
import type { OnboardedCaller } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import type { Row } from "@/server/rows";
import type { WeatherQuery } from "@/server/ports/weather";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { deleteAccount } from "../account";
import { send } from "../flights/send";
import { block, setShows } from "../friends";
import { tick } from "../tick";

const HOUR_MS = 3_600_000;
const SEVEN_AM_TOMORROW = Date.UTC(2026, 10, 20, 12);
const STORMY: WeatherSample = {
  windMph: 31,
  windFromDeg: 200,
  tempF: 38,
  precipMmH: 4,
  snow: false,
};

let deps: TestDeps;
let world: World;
let max: UserId;
let priya: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  priya = world.priya.id as UserId;
  gerald = world.max.birds[0].id;
});

afterEach(() => vi.restoreAllMocks());

async function scheduleGerald(
  releaseAt = SEVEN_AM_TOMORROW,
  friendId: UserId = priya,
) {
  const { flights } = await send(deps, max, {
    body: "Coffee at seven, my treat",
    sends: [{ friendId, birdId: gerald }],
    releaseAt,
  });
  return flights[0].id;
}

async function flightRow(id: string) {
  const [row] = await deps.db.query<{
    status: string;
    to_lat: number;
    to_lon: number;
    to_label: string;
    release_at: Date;
    arrive_at: Date | null;
    input: FlightInput | null;
    plan: FlightPlan | null;
    distance_mi: number | null;
    odds: number | null;
    delay_kind: string | null;
  }>(
    `select status, to_lat, to_lon, to_label, release_at, arrive_at, input, plan, distance_mi::float8 as distance_mi,
       odds::float8 as odds, delay_kind
     from flights where id = $1`,
    [id],
  );
  return row;
}

async function birdStatus() {
  const [row] = await deps.db.query<{ status: string }>(
    "select status from birds where id = $1",
    [gerald],
  );
  return row.status;
}

async function incomingFor(flightId: string) {
  return deps.db.query<{ user_id: string }>(
    "select user_id from notifications where kind = 'incoming' and ref_id = $1",
    [flightId],
  );
}

async function everything() {
  return {
    birds: await deps.db.query("select * from birds order by id"),
    flights: await deps.db.query("select * from flights order by id"),
    notifications: await deps.db.query(
      "select * from notifications order by id",
    ),
    events: await deps.db.query("select * from events order by id"),
  };
}

describe("scheduleReleases", () => {
  it("scenario 5: the tick releases a scheduled send with the weather of that moment, once", async () => {
    const flightId = await scheduleGerald();
    expect(await birdStatus()).toBe("scheduled");

    deps.clock.set(SEVEN_AM_TOMORROW - 1);
    await tick(deps);
    expect((await flightRow(flightId)).status).toBe("scheduled");

    deps.weather.set(STORMY);
    const asked: WeatherQuery[] = [];
    const samples = deps.weather.samples.bind(deps.weather);
    vi.spyOn(deps.weather, "samples").mockImplementation(async (at) => {
      asked.push(...at);
      return samples(at);
    });
    deps.clock.set(SEVEN_AM_TOMORROW);

    const result = await tick(deps);

    expect(result.counts.scheduleReleases).toBe(1);
    expect(asked).toHaveLength(3);
    expect(asked.every((q) => q.atMs === SEVEN_AM_TOMORROW)).toBe(true);
    const row = await flightRow(flightId);
    expect(row.status).toBe("flying");
    expect(row.input?.weather).toEqual([STORMY, STORMY, STORMY]);
    expect(row.plan).toEqual(computeFlightPlan(row.input as FlightInput));
    expect(row.arrive_at).toEqual(new Date(row.plan!.arriveAtMs));
    expect(row.distance_mi).toBeCloseTo(row.plan!.distanceMi, 2);
    expect(row.odds).toBeCloseTo(row.plan!.onTimeOdds, 2);
    expect(row.delay_kind).toBe(row.plan!.delayKind);
    expect(await birdStatus()).toBe("flying");
    expect(await incomingFor(flightId)).toEqual([{ user_id: priya }]);

    const before = await everything();
    const again = await tick(deps);
    expect(again.counts.scheduleReleases).toBe(0);
    expect(await everything()).toEqual(before);
  });

  it("departs at the scheduled time even when the tick runs late", async () => {
    const flightId = await scheduleGerald();
    deps.clock.set(SEVEN_AM_TOMORROW + HOUR_MS + 17 * 60_000);

    await tick(deps);

    const row = await flightRow(flightId);
    expect(row.status).toBe("flying");
    expect(row.release_at).toEqual(new Date(SEVEN_AM_TOMORROW));
    expect(row.input?.departAtMs).toBe(SEVEN_AM_TOMORROW);
    expect(row.plan?.segments[0].startMs).toBe(SEVEN_AM_TOMORROW);
    expect(row.arrive_at).toEqual(
      new Date(computeFlightPlan(row.input as FlightInput).arriveAtMs),
    );
  });

  it("plans the same flight whether the tick is on time or late", async () => {
    const onTime = await scheduleGerald();
    deps.clock.set(SEVEN_AM_TOMORROW);
    await tick(deps);
    const early = await flightRow(onTime);

    deps = await makeTestDeps();
    world = await seedWorld(deps.db, deps.clock.now());
    const late = await scheduleGerald();
    deps.clock.set(SEVEN_AM_TOMORROW + 2 * HOUR_MS);
    await tick(deps);
    const lateRow = await flightRow(late);

    expect({ ...lateRow.input, flightId: "" }).toEqual({
      ...early.input,
      flightId: "",
    });
  });

  it("releases a bird whose energy fell under 15", async () => {
    const flightId = await scheduleGerald(deps.clock.now() + HOUR_MS);
    await deps.db.query(
      "update birds set energy = 0, care_at = $2 where id = $1",
      [gerald, new Date(deps.clock.now()).toISOString()],
    );
    deps.clock.advance(HOUR_MS);

    await tick(deps);

    const row = await flightRow(flightId);
    expect(row.status).toBe("flying");
    expect(row.input?.bird.energy).toBeLessThan(15);
    expect(await birdStatus()).toBe("flying");
    expect(await incomingFor(flightId)).toHaveLength(1);
  });

  it("only releases flights that involve the given user", async () => {
    const flightId = await scheduleGerald();
    deps.clock.set(SEVEN_AM_TOMORROW);

    await tick(deps, { userId: world.rosa.id });
    expect((await flightRow(flightId)).status).toBe("scheduled");

    await tick(deps, { userId: priya });
    expect((await flightRow(flightId)).status).toBe("flying");
  });

  it("cancels a send whose recipient deleted their account and frees the bird", async () => {
    const flightId = await scheduleGerald();
    const [profile] = await deps.db.query<Row<"profiles">>(
      "select * from profiles where id = $1",
      [priya],
    );
    await deleteAccount(deps, {
      userId: priya,
      profile: profile as OnboardedCaller["profile"],
    });
    deps.clock.set(SEVEN_AM_TOMORROW);

    const first = await tick(deps);
    const before = await everything();
    const second = await tick(deps);

    expect(first.failed.scheduleReleases ?? 0).toBe(0);
    expect(second.failed.scheduleReleases ?? 0).toBe(0);
    expect((await flightRow(flightId)).status).toBe("cancelled");
    expect((await flightRow(flightId)).plan).toBeNull();
    expect(await birdStatus()).toBe("home");
    expect(await everything()).toEqual(before);
  });

  it("cancels a send to a friend who blocked the sender, with no incoming", async () => {
    const flightId = await scheduleGerald();
    await block(deps, priya, max);
    deps.clock.set(SEVEN_AM_TOMORROW);

    const result = await tick(deps);

    expect(result.failed.scheduleReleases ?? 0).toBe(0);
    expect(await incomingFor(flightId)).toEqual([]);
    expect((await flightRow(flightId)).status).toBe("cancelled");
    expect(await birdStatus()).toBe("home");
  });

  it("cancels a send the sender blocked the recipient on", async () => {
    const flightId = await scheduleGerald();
    await block(deps, max, priya);
    deps.clock.set(SEVEN_AM_TOMORROW);

    await tick(deps);

    expect(await incomingFor(flightId)).toEqual([]);
    expect((await flightRow(flightId)).status).toBe("cancelled");
    expect(await birdStatus()).toBe("home");
  });

  it("works out the endpoints at release, from what the recipient shares then", async () => {
    const rosa = world.rosa.id as UserId;
    const flightId = await scheduleGerald(SEVEN_AM_TOMORROW, rosa);
    const scheduled = await flightRow(flightId);
    await setShows(deps, rosa, max, "city");
    deps.clock.set(SEVEN_AM_TOMORROW);

    await tick(deps);

    const row = await flightRow(flightId);
    expect(row.status).toBe("flying");
    expect({ lat: row.to_lat, lon: row.to_lon }).not.toEqual({
      lat: scheduled.to_lat,
      lon: scheduled.to_lon,
    });
    expect(row.input?.to).toEqual({ lat: row.to_lat, lon: row.to_lon });
    expect(row.input?.to).toEqual({ lat: 40.712, lon: -74.005 });
    expect(row.plan).toEqual(computeFlightPlan(row.input as FlightInput));
  });
});
