import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { careAt } from "@/lib/game/care";
import type { OnboardedCaller, Profile } from "@/server/auth";
import { toBirdRecord, type Row } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { careAction } from "../care";
import { tick } from "../tick";

const HOUR_MS = 3_600_000;
const care = config.game.care;

let deps: TestDeps;
let world: World;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  gerald = world.max.birds[0].id;
});

async function hungryNotices(userId: string) {
  return deps.db.query<{ title: string; body: string; url: string }>(
    "select title, body, url from notifications where kind = 'hungry' and user_id = $1 order by created_at",
    [userId],
  );
}

async function geraldNotices() {
  return (await hungryNotices(world.max.id)).filter(
    (n) => n.url === `/birds/${gerald}`,
  );
}

async function reading(id: string) {
  const [row] = await deps.db.query<Row<"birds">>(
    "select * from birds where id = $1",
    [id],
  );
  const bird = toBirdRecord(row);
  return {
    hungryNotified: bird.hungryNotified,
    ...careAt(
      {
        belly: Number(bird.belly),
        feathers: Number(bird.feathers),
        energy: Number(bird.energy),
        careAtMs: bird.careAt,
        lastFedAtMs: bird.lastFedAt,
        hungryNotified: bird.hungryNotified,
        status: bird.status,
      },
      deps.clock.now(),
      { hasBirdbath: false },
    ),
  };
}

async function feedAsMax() {
  const [profile] = await deps.db.query<Profile>(
    "select * from profiles where id = $1",
    [world.max.id],
  );
  const caller = { userId: world.max.id, profile } as OnboardedCaller;
  await careAction(deps, caller, gerald, "feed", crypto.randomUUID());
}

const hoursUntilHungry = (belly: number) =>
  Math.floor((belly - care.hungryBelow) / -care.bellyPerHour) + 1;

describe("hungry notices", () => {
  it("sends none while belly is 30 or more", async () => {
    deps.clock.advance(((80 - care.hungryBelow) / -care.bellyPerHour) * HOUR_MS);

    const { counts } = await tick(deps);

    expect(counts.hungryNotices).toBe(0);
    expect(await geraldNotices()).toEqual([]);
  });

  it("sends one notice when belly crosses under 30 and none on later ticks", async () => {
    deps.clock.advance(hoursUntilHungry(80) * HOUR_MS);

    const first = await tick(deps, { userId: world.max.id });
    deps.clock.advance(HOUR_MS);
    const second = await tick(deps, { userId: world.max.id });
    deps.clock.advance(10 * HOUR_MS);
    await tick(deps, { userId: world.max.id });

    expect(first.counts.hungryNotices).toBe(2);
    expect(second.counts.hungryNotices).toBe(0);
    expect(await geraldNotices()).toEqual([
      {
        title: "Gerald is hungry",
        body: expect.any(String),
        url: `/birds/${gerald}`,
      },
    ]);
    expect((await reading(gerald)).hungryNotified).toBe(true);
  });

  it("leaves stored care values alone when it notifies", async () => {
    const [before] = await deps.db.query<Row<"birds">>(
      "select belly, care_at from birds where id = $1",
      [gerald],
    );
    deps.clock.advance(hoursUntilHungry(80) * HOUR_MS);

    await tick(deps, { userId: world.max.id });

    const [after] = await deps.db.query<Row<"birds">>(
      "select belly, care_at from birds where id = $1",
      [gerald],
    );
    expect(after).toEqual(before);
  });

  it("skips a bird that is not home", async () => {
    await deps.db.query(
      "update birds set status = 'visiting' where owner_id = $1",
      [world.max.id],
    );
    deps.clock.advance(hoursUntilHungry(80) * HOUR_MS);

    const { counts } = await tick(deps, { userId: world.max.id });

    expect(counts.hungryNotices).toBe(0);
    expect(await geraldNotices()).toEqual([]);
  });

  it("notifies only the given user on a scoped tick", async () => {
    deps.clock.advance(hoursUntilHungry(80) * HOUR_MS);

    await tick(deps, { userId: world.priya.id });

    expect(await hungryNotices(world.max.id)).toEqual([]);
    expect(await hungryNotices(world.priya.id)).toHaveLength(2);
  });

  it("scenario 10: a bird unfed for 72 hours sulks, gets one hungry notice, and feeding fixes it", async () => {
    deps.clock.advance(care.sulkAfterHoursUnfed * HOUR_MS);

    expect(await reading(gerald)).toMatchObject({
      hungry: true,
      sulking: true,
    });
    await tick(deps);
    await tick(deps);
    expect(await geraldNotices()).toHaveLength(1);

    await feedAsMax();

    expect(await reading(gerald)).toMatchObject({
      hungryNotified: false,
      sulking: false,
      belly: care.feedBelly,
      hungry: false,
    });
    await tick(deps);
    expect(await geraldNotices()).toHaveLength(1);

    deps.clock.advance(hoursUntilHungry(care.feedBelly) * HOUR_MS);
    await tick(deps);
    await tick(deps);

    expect(await geraldNotices()).toHaveLength(2);
    expect((await reading(gerald)).hungryNotified).toBe(true);
  });
});
