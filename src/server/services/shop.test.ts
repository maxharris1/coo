import { beforeEach, describe, expect, it } from "vitest";
import { careAt } from "@/lib/game/care";
import type { UserId } from "@/server/ports/auth";
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
    expect(await refusal(buy(deps, max, { itemId: "goggles" }))).toBe(
      "insufficient_seeds",
    );
    expect(await refusal(buy(deps, max, { itemId: "birdbath" }))).toBe(
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
      await buy(deps, max, { itemId }).catch(() => undefined);
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
    const result = await buy(deps, max, { itemId: "goggles" });
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
    expect(await refusal(buy(deps, max, { itemId }))).toBe("conflict");
    expect(await wallet(max)).toEqual(before);
  });

  it("refuses a gear item bought a moment ago as conflict", async () => {
    await grant(max, 1000);
    await buy(deps, max, { itemId: "goggles" });
    const before = await wallet(max);
    expect(await refusal(buy(deps, max, { itemId: "goggles" }))).toBe(
      "conflict",
    );
    expect(await wallet(max)).toEqual(before);
  });

  it("refuses a second birdbath as conflict and changes nothing", async () => {
    await grant(max, 1000);
    await buy(deps, max, { itemId: "birdbath" });
    const before = await wallet(max);
    expect(await refusal(buy(deps, max, { itemId: "birdbath" }))).toBe(
      "conflict",
    );
    expect(await wallet(max)).toEqual(before);
  });

  it.each(["", "rocket", "perches", "Birdbath"])(
    "refuses the unknown item %j as invalid",
    async (itemId) => {
      await grant(max, 1000);
      const before = await wallet(max);
      expect(await refusal(buy(deps, max, { itemId }))).toBe("invalid");
      expect(await wallet(max)).toEqual(before);
    },
  );

  it("charges 220 for the birdbath and sets it on the account", async () => {
    await grant(max, 200);
    const result = await buy(deps, max, { itemId: "birdbath" });
    expect(result.me).toMatchObject({ seeds: 40, hasBirdbath: true });
    expect(await shopRows(max)).toEqual([{ delta: -220 }]);
  });

  it("halves feather drain from the moment the birdbath is bought, not before", async () => {
    await grant(max, 200);
    const gerald = world.max.birds[0].id;
    const start = deps.clock.now();
    deps.clock.set(start + 10 * HOUR_MS);
    await buy(deps, max, { itemId: "birdbath" });
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
    await buy(deps, max, { itemId: "goggles" });
    await buy(deps, max, { itemId: "birdbath" });
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
        buy(deps, max, { itemId }),
        buy(deps, max, { itemId }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const [rejected] = results.filter((r) => r.status === "rejected");
      expect((rejected as PromiseRejectedResult).reason.code).toBe("conflict");
      expect(await shopRows(max)).toHaveLength(1);
      const after = await wallet(max);
      expect(after.ledgerSum).toBe(after.seeds);
    },
  );
});
