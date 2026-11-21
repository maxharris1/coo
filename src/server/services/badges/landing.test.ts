import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { FlightPlan, SegmentKind } from "@/lib/flight/engine";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import {
  insertPlannedDelivery,
  type PlannedDelivery,
} from "@/test/fixtures/plannedFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { tick } from "../tick";
import { landDeliveries } from "../tick/landDeliveries";

const MINUTE_MS = 60_000;
const DOWNPOUR = config.game.engine.downpourMmH;
const { aroundTheBlockUnderMi, centuryMi, longHaulMi } = config.game.badges;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

type Badge = { progress: number; earned_at: Date | null };

async function badge(userId: string, badgeId: string) {
  const [row] = await deps.db.query<Badge>(
    "select progress, earned_at from badges where user_id = $1 and badge_id = $2",
    [userId, badgeId],
  );
  return row ?? null;
}

async function plan(flightId: string) {
  const [row] = await deps.db.query<{ plan: FlightPlan }>(
    "select plan from flights where id = $1",
    [flightId],
  );
  return row.plan;
}

async function setSegments(flightId: string, kinds: SegmentKind[]) {
  const { segments } = await plan(flightId);
  const startMs = segments[0].startMs;
  const span = segments[segments.length - 1].endMs - startMs;
  const step = span / kinds.length;
  const next = kinds.map((kind, i) => ({
    kind,
    startMs: Math.round(startMs + i * step),
    endMs: Math.round(startMs + (i + 1) * step),
    fromFrac: i / kinds.length,
    toFrac: (i + 1) / kinds.length,
  }));
  await deps.db.query(
    "update flights set plan = jsonb_set(plan, '{segments}', $2::jsonb) where id = $1",
    [flightId, JSON.stringify(next)],
  );
}

async function land(flight: PlannedDelivery) {
  deps.clock.set(Math.max(deps.clock.now(), flight.arriveAtMs) + MINUTE_MS);
  const result = await landDeliveries({
    deps,
    limit: 50,
    timeUp: () => false,
  });
  expect(result.count).toBe(1);
}

async function delivery(
  edit: (flightId: string) => Promise<unknown> = async () => {},
) {
  const flight = await insertPlannedDelivery(deps.db, world, deps.clock.now());
  await edit(flight.flightId);
  return flight;
}

const setDistance = (miles: number) => (flightId: string) =>
  deps.db.query("update flights set distance_mi = $2 where id = $1", [
    flightId,
    miles,
  ]);

const setRain = (precipMmH: number) => (flightId: string) =>
  deps.db.query(
    "update flights set input = jsonb_set(input, '{weather,1,precipMmH}', to_jsonb($2::numeric)) where id = $1",
    [flightId, precipMmH],
  );

async function expectEarned(badgeId: string, flight: PlannedDelivery) {
  expect(await badge(world.max.id, badgeId)).toEqual({
    progress: 1,
    earned_at: new Date(flight.arriveAtMs),
  });
}

async function expectNotEarned(badgeId: string) {
  expect(await badge(world.max.id, badgeId)).toBeNull();
}

describe("landing badges", () => {
  it("first-flight: earned by the owner when a delivery lands", async () => {
    const flight = await delivery();
    await land(flight);
    await expectEarned("first-flight", flight);
  });

  it("first-flight: not earned by the recipient, nor before the arrival time", async () => {
    const flight = await delivery();
    deps.clock.set(flight.arriveAtMs - MINUTE_MS);
    await tick(deps);
    await expectNotEarned("first-flight");

    await land(flight);
    expect(await badge(world.priya.id, "first-flight")).toBeNull();
  });

  it("night-owl: earned when the plan roosts after the first flying segment", async () => {
    const flight = await delivery((id) =>
      setSegments(id, ["fly", "roost", "fly"]),
    );
    await land(flight);
    await expectEarned("night-owl", flight);
  });

  it("night-owl: not earned when the bird only waits for dawn before flying", async () => {
    const flight = await delivery((id) => setSegments(id, ["roost", "fly"]));
    await land(flight);
    await expectNotEarned("night-owl");
  });

  it("cher-ami: earned when any third of the weather is a downpour", async () => {
    const flight = await delivery(setRain(DOWNPOUR));
    await land(flight);
    await expectEarned("cher-ami", flight);
  });

  it("cher-ami: not earned when the rain stays under a downpour", async () => {
    const flight = await delivery(setRain(DOWNPOUR - 0.1));
    await land(flight);
    await expectNotEarned("cher-ami");
  });

  it("around-the-block: earned by a delivery under the distance", async () => {
    const flight = await delivery(setDistance(aroundTheBlockUnderMi - 0.01));
    await land(flight);
    await expectEarned("around-the-block", flight);
  });

  it("around-the-block: not earned at exactly the distance", async () => {
    const flight = await delivery(setDistance(aroundTheBlockUnderMi));
    await land(flight);
    await expectNotEarned("around-the-block");
  });

  it("century: earned at exactly the distance", async () => {
    const flight = await delivery(setDistance(centuryMi));
    await land(flight);
    await expectEarned("century", flight);
    await expectNotEarned("long-haul");
  });

  it("century: not earned just under the distance", async () => {
    const flight = await delivery(setDistance(centuryMi - 0.01));
    await land(flight);
    await expectNotEarned("century");
  });

  it("long-haul: earned at exactly the distance", async () => {
    const flight = await delivery(setDistance(longHaulMi));
    await land(flight);
    await expectEarned("long-haul", flight);
  });

  it("long-haul: not earned just under the distance", async () => {
    const flight = await delivery(setDistance(longHaulMi - 0.01));
    await land(flight);
    await expectNotEarned("long-haul");
  });

  it("full-card: earned when a landing finds a paid punch card", async () => {
    await deps.db.query(
      "insert into punch_cards (user_id, week_start, deliveries, paid) values ($1, '2026-11-16', 5, true)",
      [world.max.id],
    );
    const flight = await delivery();
    await land(flight);
    await expectEarned("full-card", flight);
  });

  it("full-card: not earned while the punch card is unpaid", async () => {
    await deps.db.query(
      "insert into punch_cards (user_id, week_start, deliveries, paid) values ($1, '2026-11-16', 4, false)",
      [world.max.id],
    );
    const flight = await delivery();
    await land(flight);
    await expectNotEarned("full-card");
  });

  it("postmaster: progress counts each new city and earns at ten", async () => {
    const goal = config.badges.badges.find((b) => b.id === "postmaster")!.goal;
    expect(goal).toBe(10);

    for (let n = 1; n <= goal; n++) {
      const flight = await insertPlannedDelivery(
        deps.db,
        world,
        deps.clock.now(),
        { dest: { city: `Town ${n}`, region: "Pennsylvania", country: "US" } },
      );
      await land(flight);
      expect(await badge(world.max.id, "postmaster")).toEqual({
        progress: n,
        earned_at: n === goal ? new Date(flight.arriveAtMs) : null,
      });
    }
  });

  it("a repeat city does not move postmaster progress", async () => {
    await land(await delivery());
    await land(await delivery());
    expect(await badge(world.max.id, "postmaster")).toEqual({
      progress: 1,
      earned_at: null,
    });
  });
});
