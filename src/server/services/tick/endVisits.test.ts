import { beforeEach, describe, expect, it } from "vitest";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld, type World } from "@/test/seedWorld";
import { releaseVisit } from "../visits/release";
import { tick } from "../tick";

const MINUTE_MS = 60_000;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

type ReturnRow = {
  id: string;
  bird_id: string;
  owner_id: string;
  counterpart_id: string | null;
  note_id: string | null;
  status: string;
  from_lat: number;
  from_lon: number;
  from_label: string;
  to_lat: number;
  to_lon: number;
  to_label: string;
  release_at: Date;
  arrive_at: Date;
  plan: { arriveAtMs: number } | null;
  input: { flightId: string; to: { lat: number; lon: number } } | null;
};

const returns = () =>
  deps.db.query<ReturnRow>(
    "select * from flights where kind = 'return' order by created_at",
  );

const visitOf = async (birdId: string) =>
  (
    await deps.db.query<{
      status: string;
      return_flight_id: string | null;
    }>("select status, return_flight_id from visits where bird_id = $1", [
      birdId,
    ])
  )[0];

const birdStatus = async (birdId: string) =>
  (
    await deps.db.query<{ status: string }>(
      "select status from birds where id = $1",
      [birdId],
    )
  )[0].status;

async function landPlanned() {
  const flight = await insertPlannedDelivery(deps.db, world, deps.clock.now());
  deps.clock.set(flight.arriveAtMs);
  await tick(deps);
  expect(await visitOf(flight.birdId)).toMatchObject({ status: "waiting" });
  return flight;
}

describe("endVisits", () => {
  it("starts an empty return flight home 30 minutes after landing (scenario 2, ac-1)", async () => {
    const flight = await landPlanned();

    deps.clock.advance(29 * MINUTE_MS);
    await tick(deps);
    expect(await returns()).toEqual([]);

    deps.clock.advance(MINUTE_MS);
    const startMs = deps.clock.now();
    const result = await tick(deps);

    expect(result.counts.endVisits).toBe(1);
    const [ret] = await returns();
    expect(ret).toMatchObject({
      bird_id: flight.birdId,
      owner_id: world.max.id,
      counterpart_id: world.priya.id,
      note_id: null,
      status: "flying",
      from_lat: 39.952,
      from_lon: -75.165,
      from_label: "Center City",
      to_lat: 40.73,
      to_lon: -73.9875,
      to_label: "East Village",
    });
    expect(ret.release_at.getTime()).toBe(startMs);
    expect(ret.input?.flightId).toBe(ret.id);
    expect(ret.arrive_at.getTime()).toBe(ret.plan?.arriveAtMs);
    expect(ret.arrive_at.getTime()).toBeGreaterThan(startMs);
    expect(await visitOf(flight.birdId)).toEqual({
      status: "left",
      return_flight_id: ret.id,
    });
    expect(await birdStatus(flight.birdId)).toBe("flying");
  });

  it("changes nothing on a second tick", async () => {
    await landPlanned();
    deps.clock.advance(30 * MINUTE_MS);
    await tick(deps);
    const before = await returns();

    const again = await tick(deps);

    expect(again.counts.endVisits).toBe(0);
    expect(await returns()).toEqual(before);
  });

  it("aims the return at the owner's travel loft when travel is on as it starts (ac-4)", async () => {
    const flight = await landPlanned();
    await deps.db.query(
      `update profiles set travel_on = true, travel_lat = 41.88, travel_lon = -87.63,
         travel_label = 'The Loop', travel_city = 'Chicago',
         travel_city_lat = 41.878, travel_city_lon = -87.629
       where id = $1`,
      [world.max.id],
    );

    deps.clock.advance(30 * MINUTE_MS);
    await tick(deps);

    const [ret] = await returns();
    expect(ret).toMatchObject({
      bird_id: flight.birdId,
      to_lat: 41.88,
      to_lon: -87.63,
      to_label: "The Loop",
    });
    expect(ret.input?.to).toEqual({ lat: 41.88, lon: -87.63 });
  });

  it("ends a visit the host released early on the next tick (ac-7)", async () => {
    const { visitId, birdId } = await insertWaitingVisit(
      deps.db,
      world,
      deps.clock.now(),
    );
    deps.clock.advance(5 * MINUTE_MS);
    const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
      "select * from profiles where id = $1",
      [world.priya.id],
    );
    await releaseVisit(
      deps,
      { userId: world.priya.id as UserId, profile } as OnboardedCaller,
      visitId,
    );
    expect(await returns()).toEqual([]);

    deps.clock.advance(MINUTE_MS);
    const result = await tick(deps);

    expect(result.counts.endVisits).toBe(1);
    const [ret] = await returns();
    expect(ret).toMatchObject({
      bird_id: birdId,
      owner_id: world.max.id,
      counterpart_id: world.priya.id,
      note_id: null,
      status: "flying",
      to_label: "East Village",
    });
    expect(await visitOf(birdId)).toEqual({
      status: "left",
      return_flight_id: ret.id,
    });
    expect(await birdStatus(birdId)).toBe("flying");
  });

  it("leaves visits of other people alone when the tick is scoped to one user", async () => {
    await landPlanned();
    deps.clock.advance(30 * MINUTE_MS);

    const result = await tick(deps, { userId: world.rosa.id });

    expect(result.counts.endVisits).toBe(0);
    expect(await returns()).toEqual([]);
  });
});
