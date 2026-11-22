import { beforeAll, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { quote, type BirdQuote } from "@/server/services/flights/quote";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { departures, forecastModel } from "./forecast";

const TZ = "America/New_York";

let deps: TestDeps;
let world: World;

beforeAll(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

async function quoteHours(hours: number[]) {
  const now = deps.clock.now();
  const at = departures(
    now,
    TZ,
    hours,
    deps.config.game.schedule.maxHoursAhead * 3_600_000,
  ).map((d) => d.at);
  const { recipients } = await quote(deps, world.max.id as UserId, {
    recipients: [{ friendId: world.priya.id as UserId }],
    birdIds: [world.max.birds[0].id],
    at,
  });
  return { now, leg: recipients[0], quotes: recipients[0].quotes };
}

describe("an hour whose flight would not arrive before sunset (ac-1)", () => {
  it("is quoted roostsOvernight by the real quote service", async () => {
    const { quotes } = await quoteHours([13, 15]);
    const [early, late]: BirdQuote[] = quotes;

    expect(early.arriveAt).toBeLessThan(early.sunsetAt);
    expect(early.roostsOvernight).toBe(false);

    expect(late.releaseAt + early.durationMs).toBeGreaterThan(late.sunsetAt);
    expect(late.roostsOvernight).toBe(true);
    expect(late.arriveAt).toBeGreaterThan(late.sunsetAt);
  });

  it("is drawn as a Roosts chip and never offered as the best hour", async () => {
    const { now, leg, quotes } = await quoteHours([13, 15]);
    const [early, late] = quotes;
    const model = forecastModel(
      leg,
      { id: world.max.birds[0].id, name: "Gerald" },
      late.releaseAt,
      now,
      TZ,
      "mi",
    );

    expect(model.chips.map((c) => [c.label, c.roosts])).toEqual([
      ["1 pm", false],
      ["3 pm", true],
    ]);
    expect(model.best?.at).toBe(early.releaseAt);
    expect(model.selected.detail).toMatch(/ tomorrow\.$/);
  });
});

describe("a flight that roosts more than one night", () => {
  it("names the day it lands instead of saying tomorrow", async () => {
    const deps = await makeTestDeps();
    const world = await seedWorld(deps.db, deps.clock.now());
    await deps.db.query(
      `update profiles set home_lat = 41.88, home_lon = -87.63, home_label = 'The Loop',
         home_city = 'Chicago', home_city_lat = 41.88, home_city_lon = -87.63
       where id = $1`,
      [world.priya.id],
    );
    const releaseAt = Date.parse("2026-11-19T20:00:00Z");
    const now = deps.clock.now();
    const { recipients } = await quote(deps, world.max.id as UserId, {
      recipients: [{ friendId: world.priya.id as UserId }],
      birdIds: [world.max.birds[0].id],
      at: [releaseAt],
    });
    const [flight] = recipients[0].quotes;
    expect(flight.roostsOvernight).toBe(true);

    const model = forecastModel(
      recipients[0],
      { id: world.max.birds[0].id, name: "Gerald" },
      releaseAt,
      now,
      TZ,
      "mi",
    );

    expect(model.selected.detail).toMatch(/ Saturday, Nov 21\.$/);
    expect(model.selected.detail).not.toContain("tomorrow");
  });
});
