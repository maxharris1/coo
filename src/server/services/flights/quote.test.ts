import { beforeEach, describe, expect, it } from "vitest";
import { haversineMi, hazardsFor, type LatLon } from "@/lib/flight/engine";
import { isWeekend } from "@/lib/game/time";
import type { UserId } from "@/server/ports/auth";
import { setShows } from "@/server/services/friends";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeClock } from "@/test/fakes/clock";
import { seedWorld, type World } from "@/test/seedWorld";
import { quote, type BirdQuote } from "./quote";

const MINUTE_MS = 60_000;
const NEW_YORK_CENTRE = { lat: 40.712, lon: -74.005 };
const MAX_ROOST = { lat: 40.73, lon: -73.9875 };
const PRIYA_ROOST = { lat: 39.952, lon: -75.165 };
const DAY_MS = 24 * 60 * MINUTE_MS;
const CALM = {
  windMph: 0,
  windFromDeg: 0,
  tempF: 55,
  precipMmH: 0,
  snow: false,
};

let deps: TestDeps;
let world: World;
let max: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  gerald = world.max.birds[0].id;
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "resolved";
}

describe("quote", () => {
  it("quotes Max to Priya in calm weather", async () => {
    const { recipients } = await quote(deps, max, {
      recipients: [{ friendId: world.priya.id as UserId }],
      birdIds: [gerald],
    });

    expect(recipients).toHaveLength(1);
    const [priya] = recipients;
    expect(priya.distanceMi).toBeCloseTo(82.1, 1);
    expect(priya.from.label).toBe("East Village");
    expect(priya.to.label).toBe("Center City");
    expect(priya.quotes).toHaveLength(1);
    const [q] = priya.quotes;
    expect(q.birdId).toBe(gerald);
    expect(q.releaseAt).toBe(deps.clock.now());
    expect(Math.abs(q.durationMs - 109.5 * MINUTE_MS)).toBeLessThan(MINUTE_MS);
    expect(q.arriveAt).toBe(q.releaseAt + q.durationMs);
    expect(q.odds).toBe(0.91);
    expect(q.roostsOvernight).toBe(false);
    expect(q.sunsetAt).toBeGreaterThan(q.releaseAt);
    expect(q.airTimeMs).toBe(q.durationMs);
    expect(q.leavesAt).toBe(q.releaseAt);
  });

  it("raises the odds to 0.94 when the bird wears the band", async () => {
    await deps.db.query(
      "insert into gear_owned (user_id, gear_id) values ($1, 'band') on conflict do nothing",
      [max],
    );
    await deps.db.query("update birds set gear = '{band}' where id = $1", [
      gerald,
    ]);

    const { recipients } = await quote(deps, max, {
      recipients: [{ friendId: world.priya.id as UserId }],
      birdIds: [gerald],
    });

    expect(recipients[0].quotes[0].odds).toBe(0.94);
  });

  it("quotes every ready bird when no bird is named", async () => {
    const { recipients } = await quote(deps, max, {
      recipients: [{ friendId: world.priya.id as UserId }],
    });

    expect(recipients[0].quotes.map((q) => q.birdId)).toEqual(
      world.max.birds.map((b) => b.id),
    );
  });

  it("quotes each requested time", async () => {
    const now = deps.clock.now();
    const later = now + 2 * 60 * MINUTE_MS;
    const { recipients } = await quote(deps, max, {
      recipients: [{ friendId: world.priya.id as UserId }],
      birdIds: [gerald],
      at: [now, later],
    });

    expect(recipients[0].quotes.map((q) => q.releaseAt)).toEqual([now, later]);
  });

  it("refuses a time in the past or past the schedule window as invalid", async () => {
    const now = deps.clock.now();
    const window = deps.config.game.schedule.maxHoursAhead * 60 * MINUTE_MS;
    for (const at of [now - MINUTE_MS, now + window + MINUTE_MS]) {
      expect(
        await refusal(
          quote(deps, max, {
            recipients: [{ friendId: world.priya.id as UserId }],
            at: [at],
          }),
        ),
      ).toBe("invalid");
    }
  });

  it("refuses a quote to someone who is not a friend as forbidden", async () => {
    expect(
      await refusal(
        quote(deps, world.priya.id as UserId, {
          recipients: [{ friendId: world.rosa.id as UserId }],
        }),
      ),
    ).toBe("forbidden");
  });

  it("refuses a quote to a blocked friend as forbidden", async () => {
    await deps.db.query(
      "update friendships set status = 'blocked', blocked_by = $1",
      [world.priya.id],
    );

    expect(
      await refusal(
        quote(deps, max, {
          recipients: [{ friendId: world.priya.id as UserId }],
        }),
      ),
    ).toBe("forbidden");
  });

  it("refuses someone else's bird as not_found", async () => {
    const kevin = world.priya.birds[0].id;

    expect(
      await refusal(
        quote(deps, max, {
          recipients: [{ friendId: world.priya.id as UserId }],
          birdIds: [gerald, kevin],
        }),
      ),
    ).toBe("not_found");
  });

  it("quotes a city-level friend to the city centre", async () => {
    await setShows(deps, world.rosa.id as UserId, max, "city");

    const { recipients } = await quote(deps, max, {
      recipients: [{ friendId: world.rosa.id as UserId }],
      birdIds: [gerald],
    });

    const centreMi =
      Math.round(haversineMi(MAX_ROOST, NEW_YORK_CENTRE) * 10) / 10;
    expect(recipients[0].distanceMi).toBe(centreMi);
    expect(recipients[0].to.label).toBe("New York");
  });

  it("quotes a block-level friend to their roost", async () => {
    const { recipients } = await quote(deps, max, {
      recipients: [{ friendId: world.rosa.id as UserId }],
      birdIds: [gerald],
    });

    const roostMi =
      Math.round(haversineMi(MAX_ROOST, { lat: 40.708, lon: -73.9575 }) * 10) /
      10;
    expect(recipients[0].distanceMi).toBe(roostMi);
    expect(recipients[0].to.label).toBe("Williamsburg");
  });

  it("review repro: city-only origin", async () => {
    await setShows(deps, max, world.rosa.id as UserId, "city");
    await setShows(deps, world.rosa.id as UserId, max, "city");

    const { recipients } = await quote(deps, max, {
      recipients: [{ friendId: world.rosa.id as UserId }],
      birdIds: [gerald],
    });

    const [rosa] = recipients;
    expect({
      miles: rosa.distanceMi,
      from: rosa.from.label,
      durationMs: rosa.quotes[0].durationMs,
    }).toEqual({ miles: 0, from: "New York", durationMs: 0 });
  });

  it("flies from the sender's city centre when the sender shows only the city", async () => {
    await setShows(deps, max, world.rosa.id as UserId, "city");

    const { recipients } = await quote(deps, max, {
      recipients: [
        { friendId: world.rosa.id as UserId },
        { friendId: world.priya.id as UserId },
      ],
      birdIds: [gerald],
    });

    const [rosa, priya] = recipients;
    const rosaRoost = { lat: 40.708, lon: -73.9575 };
    expect(rosa.distanceMi).toBe(
      Math.round(haversineMi(NEW_YORK_CENTRE, rosaRoost) * 10) / 10,
    );
    expect(rosa.from.label).toBe("New York");
    expect(rosa.to.label).toBe("Williamsburg");
    expect(JSON.stringify(rosa)).not.toContain("East Village");
    expect(priya.from.label).toBe("East Village");
    expect(priya.distanceMi).toBeCloseTo(82.1, 1);
  });

  it("asks the weather port once for every recipient and time", async () => {
    const asked: number[] = [];
    const samples = deps.weather.samples.bind(deps.weather);
    deps.weather.samples = async (at) => {
      asked.push(at.length);
      return samples(at);
    };

    await quote(deps, max, {
      recipients: [
        { friendId: world.priya.id as UserId },
        { friendId: world.rosa.id as UserId },
      ],
      birdIds: [gerald],
      at: [deps.clock.now(), deps.clock.now() + 60 * MINUTE_MS],
    });

    expect(asked).toEqual([2 * 2 * 3]);
  });

  it("names a headwind and the minutes it costs", async () => {
    deps.weather.set({ ...CALM, windMph: 14, windFromDeg: 225 });

    const { recipients } = await quote(deps, max, {
      recipients: [{ friendId: world.priya.id as UserId }],
      birdIds: [gerald],
    });

    const [q] = recipients[0].quotes;
    const headwind = q.factors.find((f) => f.kind === "headwind");
    expect(headwind).toMatchObject({
      text: "14 mph from the southwest",
      effect: expect.stringMatching(/^\+1[7-9] min$/),
    });
  });

  it("lists no factors in calm weather on a quiet day", async () => {
    const { recipients } = await quote(deps, max, {
      recipients: [{ friendId: world.priya.id as UserId }],
      birdIds: [gerald],
    });

    expect(recipients[0].quotes[0].factors).toEqual([]);
  });

  it("splits the odds lost to rain, a hawk and a fair into one entry each", async () => {
    let day = Date.UTC(2026, 10, 19, 15);
    while (
      !isWeekend(day, "America/New_York") ||
      !Object.values(hazardsFor(day, MAX_ROOST, PRIYA_ROOST, true)).every(
        Boolean,
      )
    )
      day += DAY_MS;
    deps = await makeTestDeps({ clock: new FakeClock(day) });
    world = await seedWorld(deps.db, day);
    deps.weather.set({ ...CALM, precipMmH: 1 });

    const { recipients } = await quote(deps, world.max.id as UserId, {
      recipients: [{ friendId: world.priya.id as UserId }],
      birdIds: [world.max.birds[0].id],
    });

    const [q] = recipients[0].quotes;
    const odds = q.factors.filter((f) => f.effect.endsWith("% off"));
    expect(odds.map((f) => f.kind).sort()).toEqual(["fair", "hawk", "rain"]);
    const lost = odds.reduce((sum, f) => sum + parseInt(f.effect, 10), 0);
    expect(lost).toBe(Math.round((0.91 - q.odds) * 100));
    expect(lost).toBe(13);
  });

  describe("night goggles", () => {
    const TEN_PM = Date.UTC(2026, 10, 20, 3);
    const CHICAGO = { lat: 41.8781, lon: -87.6298 };

    async function quoteGerald(
      gear: string[],
      {
        at = TEN_PM,
        focus,
        rain = false,
        priyaHome,
      }: {
        at?: number;
        focus?: number;
        rain?: boolean;
        priyaHome?: LatLon;
      } = {},
    ) {
      deps = await makeTestDeps({ clock: new FakeClock(at) });
      world = await seedWorld(deps.db, at);
      const bird = world.max.birds[0].id;
      await deps.db.query(
        "update birds set gear = $1, focus = coalesce($2, focus) where id = $3",
        [gear, focus ?? null, bird],
      );
      if (priyaHome)
        await deps.db.query(
          "update profiles set home_lat = $1, home_lon = $2 where id = $3",
          [priyaHome.lat, priyaHome.lon, world.priya.id],
        );
      if (rain) deps.weather.set({ ...CALM, precipMmH: 1 });
      const { recipients } = await quote(deps, world.max.id as UserId, {
        recipients: [{ friendId: world.priya.id as UserId }],
        birdIds: [bird],
      });
      return recipients[0].quotes[0];
    }

    const NIGHT = {
      kind: "night",
      text: "Flying in the dark",
      effect: "3% off",
    };

    it("names the odds lost to flying in the dark", async () => {
      const bare = await quoteGerald([]);
      expect(bare.odds).toBe(0.91);
      expect(bare.factors).toEqual([]);

      const q = await quoteGerald(["nightgoggles"]);

      expect(q.odds).toBe(0.88);
      expect(q.roostsOvernight).toBe(false);
      expect(q.factors).toEqual([NIGHT]);
    });

    it("keeps the rain factor at 6% off when flying in the dark", async () => {
      const q = await quoteGerald(["nightgoggles"], { rain: true });

      expect(q.factors).toContainEqual({
        kind: "rain",
        text: "Light rain along the route",
        effect: "6% off",
      });
      expect(q.factors).toContainEqual(NIGHT);
    });

    it("keeps the distance factor of a bird that roosts", async () => {
      const distance = (q: BirdQuote) =>
        q.factors.find((f) => f.kind === "distance");

      const bare = await quoteGerald([], { priyaHome: CHICAGO });
      const goggled = await quoteGerald(["nightgoggles"], {
        priyaHome: CHICAGO,
      });

      expect(bare.roostsOvernight).toBe(true);
      expect(goggled.roostsOvernight).toBe(false);
      expect(distance(bare)).toMatchObject({ effect: "6% off" });
      expect(distance(goggled)).toEqual(distance(bare));
    });

    it("lists no night factor on a daylight flight", async () => {
      const q = await quoteGerald(["nightgoggles"], {
        at: Date.UTC(2026, 10, 19, 15),
      });

      expect(q.odds).toBe(0.91);
      expect(q.factors).toEqual([]);
    });

    it("lists no night factor when the odds are already at their best", async () => {
      const q = await quoteGerald(["band", "nightgoggles"], { focus: 5 });

      expect(q.odds).toBe(0.99);
      expect(q.roostsOvernight).toBe(false);
      expect(q.factors.map((f) => f.kind)).not.toContain("night");
    });
  });

  describe("a 0.1 mi hop from the East Village on 2026-11-22", () => {
    const NIGHT = Date.parse("2026-11-22T21:40:00Z");
    const DAY = Date.parse("2026-11-22T19:00:00Z");
    const SUNRISE = Date.parse("2026-11-23T11:52:00Z");

    async function hop(
      clockMs: number,
      at?: number[],
      gear: { owned?: string[]; worn?: string[] } = {},
    ) {
      deps = await makeTestDeps({ clock: new FakeClock(clockMs) });
      world = await seedWorld(deps.db, clockMs);
      deps.weather.set(CALM);
      await deps.db.query(
        "update birds set speed_mph = 54, gear = coalesce($2, gear) where id = $1",
        [world.max.birds[0].id, gear.worn ?? null],
      );
      for (const gearId of gear.owned ?? []) {
        await deps.db.query(
          "insert into gear_owned (user_id, gear_id, acquired_at) values ($1, $2, to_timestamp($3 / 1000.0))",
          [world.max.id, gearId, clockMs],
        );
      }
      await deps.db.query(
        "update profiles set home_lat = $1, home_lon = $2 where id = $3",
        [MAX_ROOST.lat + 0.0015, MAX_ROOST.lon, world.rosa.id],
      );
      const { recipients } = await quote(deps, world.max.id as UserId, {
        recipients: [{ friendId: world.rosa.id as UserId }],
        birdIds: [world.max.birds[0].id],
        at,
      });
      expect(recipients[0].distanceMi).toBe(0.1);
      return recipients[0].quotes[0];
    }

    it("waits at the loft for sunrise after a 4:40 pm release", async () => {
      const q = await hop(NIGHT);

      expect(q.releaseAt).toBe(NIGHT);
      expect(q.roostsOvernight).toBe(true);
      expect(Math.abs(q.leavesAt - SUNRISE)).toBeLessThan(5 * MINUTE_MS);
      expect(q.airTimeMs).toBeGreaterThan(5_000);
      expect(q.airTimeMs).toBeLessThan(9_000);
      expect(q.arriveAt).toBe(q.leavesAt + q.airTimeMs);
      expect(q.durationMs).toBe(q.arriveAt - q.releaseAt);
    });

    it("flies through the dark at release in night-vision goggles", async () => {
      const q = await hop(NIGHT, undefined, {
        owned: ["nightgoggles"],
        worn: ["nightgoggles"],
      });

      expect(q.roostsOvernight).toBe(false);
      expect(q.leavesAt).toBe(q.releaseAt);
      expect(q.airTimeMs).toBeGreaterThan(5_000);
      expect(q.airTimeMs).toBeLessThan(9_000);
      expect(q.arriveAt).toBe(q.leavesAt + q.airTimeMs);
    });

    it("still waits for sunrise when the goggles are owned but not worn", async () => {
      const q = await hop(NIGHT, undefined, { owned: ["nightgoggles"] });

      expect(q.roostsOvernight).toBe(true);
      expect(Math.abs(q.leavesAt - SUNRISE)).toBeLessThan(5 * MINUTE_MS);
    });

    it("says a goggled bird flies in the dark only when its hop meets the dark", async () => {
      const goggles = { owned: ["nightgoggles"], worn: ["nightgoggles"] };

      const night = await hop(NIGHT, undefined, goggles);
      expect(night.fliesInDark).toBe(true);
      expect(night.roostsOvernight).toBe(false);
      expect(night.leavesAt).toBe(night.releaseAt);

      const day = await hop(DAY, [DAY], goggles);
      expect(day.fliesInDark).toBe(false);
      expect(day.factors.map((f) => f.kind)).not.toContain("night");

      const bare = await hop(NIGHT);
      expect(bare.fliesInDark).toBe(false);
      expect(bare.leavesAt).toBeGreaterThan(bare.releaseAt);
    });

    it("leaves at release after a 2:00 pm release", async () => {
      const q = await hop(DAY, [DAY]);

      expect(q.roostsOvernight).toBe(false);
      expect(q.leavesAt).toBe(q.releaseAt);
      expect(q.airTimeMs).toBe(q.durationMs);
      expect(q.airTimeMs).toBeLessThan(9_000);
    });
  });
});
