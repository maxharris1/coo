import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import type { DeliveryOpts } from "@/test/fixtures/flights";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { getCollection } from "./collection";
import { landDeliveries } from "./tick/landDeliveries";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

const collectionOf = (userId: string) => getCollection(deps, userId as UserId);

async function setBadge(
  userId: string,
  badgeId: string,
  progress: number,
  earnedAtMs: number | null,
) {
  await deps.db.query(
    `insert into badges (user_id, badge_id, progress, earned_at)
     values ($1, $2, $3, to_timestamp($4 / 1000.0))`,
    [userId, badgeId, progress, earnedAtMs],
  );
}

async function setPostmark(userId: string, city: string, earnedAtMs: number) {
  await deps.db.query(
    `insert into postmarks (user_id, place_key, city, region, country, earned_at)
     values ($1, lower($2) || '|pa|us', $2, 'PA', 'US', to_timestamp($3 / 1000.0))`,
    [userId, city, earnedAtMs],
  );
}

async function land(opts: DeliveryOpts) {
  const flight = await insertPlannedDelivery(
    deps.db,
    world,
    deps.clock.now(),
    opts,
  );
  deps.clock.set(Math.max(deps.clock.now(), flight.arriveAtMs) + MINUTE_MS);
  const result = await landDeliveries({
    deps,
    limit: 50,
    timeUp: () => false,
  });
  expect(result.count).toBe(1);
}

describe("getCollection", () => {
  it("lists all twelve badges in config order at 0 of goal before any are earned", async () => {
    const { badges } = await collectionOf(world.max.id);

    expect(badges).toEqual(
      config.badges.badges.map((b) => ({
        id: b.id,
        name: b.name,
        text: b.text,
        icon: b.icon,
        goal: b.goal,
        progress: 0,
        earnedAt: null,
      })),
    );
  });

  it("shows a badge part way as n of goal with no earnedAt", async () => {
    await setBadge(world.max.id, "rfc-1149", 4, null);

    const { badges } = await collectionOf(world.max.id);

    expect(badges.find((b) => b.id === "rfc-1149")).toMatchObject({
      progress: 4,
      goal: 9,
      earnedAt: null,
    });
  });

  it("caps progress at the goal and keeps the first earnedAt once earned", async () => {
    const earnedAt = deps.clock.now() - DAY_MS;
    await setBadge(world.max.id, "rfc-1149", 11, earnedAt);
    await setBadge(world.max.id, "first-flight", 1, earnedAt);

    const { badges } = await collectionOf(world.max.id);

    expect(badges.find((b) => b.id === "rfc-1149")).toMatchObject({
      progress: 9,
      goal: 9,
      earnedAt,
    });
    expect(badges.find((b) => b.id === "first-flight")).toMatchObject({
      progress: 1,
      goal: 1,
      earnedAt,
    });
  });

  it("lists my postmarks newest first", async () => {
    const now = deps.clock.now();
    await setPostmark(world.max.id, "Pittsburgh", now - 2 * DAY_MS);
    await setPostmark(world.max.id, "Erie", now - DAY_MS);

    const { postmarks } = await collectionOf(world.max.id);

    expect(postmarks).toEqual([
      { city: "Erie", region: "PA", country: "US", earnedAt: now - DAY_MS },
      {
        city: "Pittsburgh",
        region: "PA",
        country: "US",
        earnedAt: now - 2 * DAY_MS,
      },
    ]);
  });

  it("shows only my own badges and postmarks, never someone else's", async () => {
    await setBadge(world.priya.id, "century", 1, deps.clock.now());
    await setPostmark(world.priya.id, "Scranton", deps.clock.now());

    const mine = await collectionOf(world.max.id);

    expect(mine.postmarks).toEqual([]);
    expect(mine.badges.every((b) => b.progress === 0)).toBe(true);
  });

  it("names the account the collection belongs to", async () => {
    expect((await collectionOf(world.max.id)).account).toBe(world.max.id);
    expect((await collectionOf(world.priya.id)).account).toBe(world.priya.id);
  });

  it("starts with no birds met", async () => {
    expect((await collectionOf(world.priya.id)).birdsMet).toBe(0);
  });

  it("counts a bird that lands on my sill twice as one bird met", async () => {
    const gerald = world.max.birds[0].id;
    await land({ from: world.max, to: world.priya, birdId: gerald });
    await land({ from: world.max, to: world.priya, birdId: gerald });

    expect((await collectionOf(world.priya.id)).birdsMet).toBe(1);
  });

  it("counts each distinct bird that lands on my sill", async () => {
    await land({
      from: world.max,
      to: world.priya,
      birdId: world.max.birds[0].id,
    });
    await land({
      from: world.max,
      to: world.priya,
      birdId: world.max.birds[1].id,
    });

    expect((await collectionOf(world.priya.id)).birdsMet).toBe(2);
  });

  it("does not count birds that landed on someone else's sill, nor my own birds", async () => {
    await land({
      from: world.max,
      to: world.rosa,
      birdId: world.max.birds[0].id,
    });
    await land({
      from: world.max,
      to: world.priya,
      birdId: world.max.birds[1].id,
    });

    expect((await collectionOf(world.priya.id)).birdsMet).toBe(1);
    expect((await collectionOf(world.max.id)).birdsMet).toBe(0);
  });
});
