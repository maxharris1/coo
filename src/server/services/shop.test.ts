import { beforeEach, describe, expect, it } from "vitest";
import {
  computeFlightPlan,
  type FlightInput,
  type WeatherSample,
} from "@/lib/flight/engine";
import {
  careAt,
  projectCare,
  settleFlight,
  type CareSnapshot,
} from "@/lib/game/care";
import type { UserId } from "@/server/ports/auth";
import { config } from "@/lib/config";
import { toBirdRecord, type Row } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { buy } from "./shop";

const HOUR_MS = 3_600_000;

let deps: TestDeps;
let world: World;
let max: UserId;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
});

async function grant(user: string, seeds: number) {
  await deps.db.query("select apply_seeds($1, $2, 'test', null)", [
    user,
    seeds,
  ]);
}

async function wallet(user: string) {
  const [profile] = await deps.db.query<{
    seeds: number;
    has_birdbath: boolean;
    perches: number;
  }>("select seeds, has_birdbath, perches from profiles where id = $1", [user]);
  const [{ sum, rows }] = await deps.db.query<{ sum: number; rows: number }>(
    "select coalesce(sum(delta), 0)::int as sum, count(*)::int as rows from seed_ledger where user_id = $1",
    [user],
  );
  const closet = await deps.db.query<{ gear_id: string }>(
    "select gear_id from gear_owned where user_id = $1 order by gear_id",
    [user],
  );
  return {
    ...profile,
    ledgerSum: sum,
    ledgerRows: rows,
    closet: closet.map((c) => c.gear_id),
  };
}

async function shopRows(user: string) {
  return deps.db.query<{ delta: number }>(
    "select delta from seed_ledger where user_id = $1 and reason = 'shop' order by id",
    [user],
  );
}

async function snapshot(birdId: string): Promise<CareSnapshot> {
  const [row] = await deps.db.query<Row<"birds">>(
    "select * from birds where id = $1",
    [birdId],
  );
  const bird = toBirdRecord(row);
  return {
    belly: bird.belly,
    feathers: bird.feathers,
    energy: bird.energy,
    careAtMs: bird.careAt,
    lastFedAtMs: bird.lastFedAt,
    hungryNotified: bird.hungryNotified,
    status: bird.status,
  };
}

const rain: WeatherSample = {
  windMph: 0,
  windFromDeg: 0,
  tempF: 55,
  precipMmH: 2,
  snow: false,
};

const LISTED = new Map<string, number>(
  [...config.gear.items, ...config.game.loftItems].map((item) => [
    item.id,
    item.price,
  ]),
);

const item = (itemId: string, price = LISTED.get(itemId) ?? 0) => ({
  itemId,
  price,
});

async function refusal(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (err: { code?: string }) => err.code,
  );
}

describe("buy", () => {
  it("scenario 9: buying without enough seeds is insufficient_seeds and changes nothing", async () => {
    const before = await wallet(max);
    expect(before.seeds).toBeLessThan(120);
    expect(await refusal(buy(deps, max, item("goggles")))).toBe(
      "insufficient_seeds",
    );
    expect(await refusal(buy(deps, max, item("birdbath")))).toBe(
      "insufficient_seeds",
    );
    expect(await wallet(max)).toEqual(before);
  });

  it("scenario 9: the ledger sums to the balance after every buy and every refusal", async () => {
    await grant(max, 400);
    const steps = [
      "goggles",
      "birdbath",
      "goggles",
      "beanie",
      "birdbath",
      "booties",
    ];
    for (const itemId of steps) {
      await buy(deps, max, item(itemId)).catch(() => undefined);
      const after = await wallet(max);
      expect(after.ledgerSum).toBe(after.seeds);
    }
    const end = await wallet(max);
    expect(end.seeds).toBe(460 - 120 - 220 - 110);
    expect(end.closet).toEqual(["beanie", "bell", "bow", "goggles"]);
    expect(await shopRows(max)).toEqual([
      { delta: -120 },
      { delta: -220 },
      { delta: -110 },
    ]);
  });

  it("charges the gear price once, adds it to the closet and returns the account", async () => {
    await grant(max, 100);
    const result = await buy(deps, max, item("goggles"));
    expect(result.me).toMatchObject({ id: max, seeds: 40 });
    expect(result.closet).toEqual(["bell", "bow", "goggles"]);
    expect(await shopRows(max)).toEqual([{ delta: -120 }]);
  });

  it.each([
    ["an owned gear item", "bell"],
    ["the backpack, which is not for sale", "backpack"],
  ])("refuses %s as conflict and changes nothing", async (_, itemId) => {
    await grant(max, 1000);
    const before = await wallet(max);
    expect(await refusal(buy(deps, max, item(itemId)))).toBe("conflict");
    expect(await wallet(max)).toEqual(before);
  });

  it("refuses a gear item bought a moment ago as conflict", async () => {
    await grant(max, 1000);
    await buy(deps, max, item("goggles"));
    const before = await wallet(max);
    expect(await refusal(buy(deps, max, item("goggles")))).toBe("conflict");
    expect(await wallet(max)).toEqual(before);
  });

  it("refuses a second birdbath as conflict and changes nothing", async () => {
    await grant(max, 1000);
    await buy(deps, max, item("birdbath"));
    const before = await wallet(max);
    expect(await refusal(buy(deps, max, item("birdbath")))).toBe("conflict");
    expect(await wallet(max)).toEqual(before);
  });

  it.each(["", "rocket", "perches", "Birdbath"])(
    "refuses the unknown item %j as invalid",
    async (itemId) => {
      await grant(max, 1000);
      const before = await wallet(max);
      expect(await refusal(buy(deps, max, item(itemId)))).toBe("invalid");
      expect(await wallet(max)).toEqual(before);
    },
  );

  it("charges 220 for the birdbath and sets it on the account", async () => {
    await grant(max, 200);
    const result = await buy(deps, max, item("birdbath"));
    expect(result.me).toMatchObject({ seeds: 40, hasBirdbath: true });
    expect(await shopRows(max)).toEqual([{ delta: -220 }]);
  });

  it("halves feather drain from the moment the birdbath is bought, not before", async () => {
    await grant(max, 200);
    const gerald = world.max.birds[0].id;
    const start = deps.clock.now();
    deps.clock.set(start + 10 * HOUR_MS);
    await buy(deps, max, item("birdbath"));
    const at = start + 30 * HOUR_MS;
    const [row] = await deps.db.query<Row<"birds">>(
      "select * from birds where id = $1",
      [gerald],
    );
    const bird = toBirdRecord(row);
    const reading = careAt(
      {
        belly: bird.belly,
        feathers: bird.feathers,
        energy: bird.energy,
        careAtMs: bird.careAt,
        lastFedAtMs: bird.lastFedAt,
        hungryNotified: bird.hungryNotified,
        status: bird.status,
      },
      at,
      { hasBirdbath: true },
    );
    expect(reading.feathers).toBe(80 - 10 - 20 * 0.5);
  });

  it("leaves another player's seeds, closet, birds and birdbath alone", async () => {
    await grant(max, 1000);
    const priya = world.priya.id;
    const before = await wallet(priya);
    const birdsBefore = await deps.db.query(
      "select * from birds where owner_id = $1 order by id",
      [priya],
    );
    await buy(deps, max, item("goggles"));
    await buy(deps, max, item("birdbath"));
    expect(await wallet(priya)).toEqual(before);
    expect(
      await deps.db.query(
        "select * from birds where owner_id = $1 order by id",
        [priya],
      ),
    ).toEqual(birdsBefore);
  });

  it.each(["goggles", "birdbath"])(
    "charges once when two buys of %s arrive at once",
    async (itemId) => {
      await grant(max, 1000);
      const results = await Promise.allSettled([
        buy(deps, max, item(itemId)),
        buy(deps, max, item(itemId)),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const [rejected] = results.filter((r) => r.status === "rejected");
      expect((rejected as PromiseRejectedResult).reason.code).toBe("conflict");
      expect(await shopRows(max)).toHaveLength(1);
      const after = await wallet(max);
      expect(after.ledgerSum).toBe(after.seeds);
    },
  );

  it.each([
    ["the fourth perch at a stale price", "perch", 400],
    ["gear at a stale price", "goggles", 100],
    ["the birdbath at a stale price", "birdbath", 0],
  ])("refuses %s as conflict and charges nothing", async (_, itemId, price) => {
    await grant(max, 1000);
    const before = await wallet(max);
    const err = await buy(deps, max, { itemId, price }).catch(
      (e: { code?: string; message?: string }) => e,
    );
    expect(err).toMatchObject({
      code: "conflict",
      message: "The price changed. Take another look.",
    });
    expect(await wallet(max)).toEqual(before);
    expect(await shopRows(max)).toEqual([]);
  });

  it("refuses a stale price before checking the balance", async () => {
    const before = await wallet(max);
    expect(before.seeds).toBeLessThan(250);
    expect(await refusal(buy(deps, max, item("perch", 400)))).toBe("conflict");
    expect(await wallet(max)).toEqual(before);
  });

  it("sells perch 4 for 250 and perch 5 for 400", async () => {
    await grant(max, 650);
    const before = await wallet(max);
    expect(before.perches).toBe(3);
    const fourth = await buy(deps, max, item("perch", 250));
    expect(fourth.me).toMatchObject({
      perches: 4,
      seeds: before.seeds - 250,
    });
    const fifth = await buy(deps, max, item("perch", 400));
    expect(fifth.me).toMatchObject({
      perches: 5,
      seeds: before.seeds - 650,
    });
    expect(await shopRows(max)).toEqual([{ delta: -250 }, { delta: -400 }]);
    const after = await wallet(max);
    expect(after.ledgerSum).toBe(after.seeds);
  });

  it("refuses a sixth perch as conflict and changes nothing", async () => {
    await grant(max, 2000);
    await buy(deps, max, item("perch", 250));
    await buy(deps, max, item("perch", 400));
    const before = await wallet(max);
    expect(before.perches).toBe(5);
    expect(await refusal(buy(deps, max, item("perch", 400)))).toBe("conflict");
    const after = await wallet(max);
    expect(after).toEqual(before);
    expect(after.ledgerSum).toBe(after.seeds);
  });

  it("refuses a perch the caller cannot afford as insufficient_seeds", async () => {
    await grant(max, 200);
    await buy(deps, max, item("birdbath"));
    const before = await wallet(max);
    expect(before.seeds).toBeLessThan(250);
    expect(await refusal(buy(deps, max, item("perch", 250)))).toBe(
      "insufficient_seeds",
    );
    expect(await wallet(max)).toEqual(before);
  });

  it("prices two perch buys at once as perch 4 then perch 5", async () => {
    await grant(max, 650);
    await Promise.all([
      buy(deps, max, item("perch", 250)),
      buy(deps, max, item("perch", 400)),
    ]);
    expect(await shopRows(max)).toEqual([{ delta: -250 }, { delta: -400 }]);
    const after = await wallet(max);
    expect(after.perches).toBe(5);
    expect(after.ledgerSum).toBe(after.seeds);
  });

  it("leaves another player's perches alone", async () => {
    await grant(max, 650);
    const before = await wallet(world.priya.id);
    await buy(deps, max, item("perch", 250));
    expect(await wallet(world.priya.id)).toEqual(before);
  });

  it("finishes a bath that ended before the purchase at its end time, then drains at the full rate", async () => {
    await grant(max, 200);
    const gerald = world.max.birds[0].id;
    const start = deps.clock.now();
    await deps.db.query(
      `update birds set status = 'busy', busy_kind = 'bath', feathers = 40,
       care_at = to_timestamp($2 / 1000.0), busy_until = to_timestamp($3 / 1000.0) where id = $1`,
      [gerald, start, start + 10 * 60_000],
    );
    const boughtAt = start + 70 * 60_000;
    deps.clock.set(boughtAt);
    await buy(deps, max, item("birdbath"));
    const after = await snapshot(gerald);
    expect(careAt(after, boughtAt, { hasBirdbath: true }).feathers).toBe(99);
    expect(
      careAt(after, boughtAt + 2 * HOUR_MS, { hasBirdbath: true }).feathers,
    ).toBe(98);
    const [row] = await deps.db.query<{
      status: string;
      busy_kind: string | null;
    }>("select status, busy_kind from birds where id = $1", [gerald]);
    expect(row).toEqual({ status: "home", busy_kind: null });
  });

  it("charges an overdue flight's costs at its arrival before the purchase, once", async () => {
    await grant(max, 200);
    const gerald = world.max.birds[0].id;
    const departAtMs = deps.clock.now();
    const flightId = "00000000-0000-4000-f000-000000000001";
    const input: FlightInput = {
      flightId,
      from: { lat: 40.73, lon: -73.99 },
      to: { lat: 39.95, lon: -75.17 },
      departAtMs,
      bird: {
        speedMph: 45,
        focus: 2,
        navigation: 4,
        breed: "city",
        level: 1,
        belly: 80,
        feathers: 80,
        energy: 100,
        sulking: false,
      },
      gear: [],
      weather: [rain, rain, rain],
    };
    const plan = computeFlightPlan(input);
    await deps.db.query(
      `update birds set status = 'flying', belly = 80, feathers = 80, energy = 100,
       care_at = to_timestamp($2 / 1000.0) where id = $1`,
      [gerald, departAtMs],
    );
    await deps.db.query(
      `insert into flights (id, kind, bird_id, owner_id, counterpart_id, from_lat, from_lon, from_label,
         to_lat, to_lon, to_label, status, release_at, arrive_at, input, plan)
       values ($1, 'delivery', $2, $3, $4, 40.73, -73.99, 'East Village', 39.95, -75.17, 'Philadelphia',
         'flying', to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0), $7, $8)`,
      [
        flightId,
        gerald,
        max,
        world.priya.id,
        departAtMs,
        plan.arriveAtMs,
        JSON.stringify(input),
        JSON.stringify(plan),
      ],
    );
    const departed = await snapshot(gerald);
    const boughtAt = plan.arriveAtMs + HOUR_MS;
    deps.clock.set(boughtAt);
    await buy(deps, max, item("birdbath"));

    const landed = settleFlight(departed, plan, input, { hasBirdbath: false });
    expect(landed.energy).toBeLessThan(100);
    expect(landed.feathers).toBeLessThan(80 - 15);
    const expected = projectCare(landed, boughtAt, { hasBirdbath: false });
    const after = await snapshot(gerald);
    expect(careAt(after, boughtAt, { hasBirdbath: true })).toMatchObject({
      energy: expected.energy,
      feathers: expected.feathers,
      belly: expected.belly,
    });
    expect(settleFlight(after, plan, input, { hasBirdbath: true })).toEqual(
      after,
    );
  });
});
