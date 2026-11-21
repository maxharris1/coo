import { beforeEach, describe, expect, it } from "vitest";
import { haversineMi } from "@/lib/flight/engine";
import type { UserId } from "@/server/ports/auth";
import { setShows } from "@/server/services/friends";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { quote } from "./quote";

const MINUTE_MS = 60_000;
const NEW_YORK_CENTRE = { lat: 40.712, lon: -74.005 };
const MAX_ROOST = { lat: 40.73, lon: -73.9875 };

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
});
