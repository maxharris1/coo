import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { shopBuyPost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, shopBuyPost, "/api/shop/buy");
});

async function withProfile(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  return session;
}

async function onboarded(number: string, name: string, seeds = 0) {
  const session = await withProfile(number, name);
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  if (seeds > 0) {
    await deps.db.query("select apply_seeds($1, $2, 'test', null)", [
      session.id,
      seeds,
    ]);
  }
  return session;
}

async function balance(id: string) {
  const [row] = await deps.db.query<{ seeds: number; ledger: number }>(
    `select seeds, (select coalesce(sum(delta), 0)::int from seed_ledger where user_id = $1) as ledger
     from profiles where id = $1`,
    [id],
  );
  return row;
}

describe("POST /api/shop/buy", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.post({
      itemId: "goggles",
      price: 180,
      actionId: crypto.randomUUID(),
    });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.post(
      { itemId: "goggles", price: 180, actionId: crypto.randomUUID() },
      jar,
    );
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });

  it.each([
    ["an empty body", {}],
    ["an unknown key", { itemId: "goggles", price: 180, userId: "someone" }],
    ["an unknown item", { itemId: "rocket", price: 0 }],
    ["a missing price", { itemId: "goggles" }],
    ["a fractional price", { itemId: "goggles", price: 179.5 }],
    ["a negative price", { itemId: "goggles", price: -180 }],
    ["a missing actionId", { itemId: "goggles", price: 180 }],
    [
      "an actionId that is not a uuid",
      { itemId: "goggles", price: 180, actionId: "again" },
    ],
  ])("answers %s with 400 invalid", async (_, body) => {
    const { jar } = await onboarded("(555) 123-4567", "Max", 1000);
    const { status, json } = await client.post(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("answers a buy the caller cannot afford with 402 insufficient_seeds", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const before = await balance(id);
    const { status, json } = await client.post(
      { itemId: "birdbath", price: 220, actionId: crypto.randomUUID() },
      jar,
    );
    expect(status).toBe(402);
    expect(json.error.code).toBe("insufficient_seeds");
    expect(await balance(id)).toEqual(before);
  });

  it("buys gear and returns the account and closet", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", 1000);
    const before = await balance(id);
    const { status, json } = await client.post(
      { itemId: "goggles", price: 180, actionId: crypto.randomUUID() },
      jar,
    );
    expect(status).toBe(200);
    expect(json.me).toMatchObject({ id, seeds: before.seeds - 180 });
    expect(json.closet).toContain("goggles");
    const after = await balance(id);
    expect(after.ledger).toBe(after.seeds);
  });

  it("answers a second birdbath with 409 conflict", async () => {
    const { jar } = await onboarded("(555) 123-4567", "Max", 1000);
    expect(
      (
        await client.post(
          { itemId: "birdbath", price: 220, actionId: crypto.randomUUID() },
          jar,
        )
      ).status,
    ).toBe(200);
    const { status, json } = await client.post(
      { itemId: "birdbath", price: 220, actionId: crypto.randomUUID() },
      jar,
    );
    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
  });

  it("sells perch 4 for 250 and perch 5 for 400, then answers a sixth with 409 conflict", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", 1000);
    const before = await balance(id);
    const fourth = await client.post(
      { itemId: "perch", price: 250, actionId: crypto.randomUUID() },
      jar,
    );
    expect(fourth.status).toBe(200);
    expect(fourth.json.me).toMatchObject({
      perches: 4,
      seeds: before.seeds - 250,
    });
    const fifth = await client.post(
      { itemId: "perch", price: 400, actionId: crypto.randomUUID() },
      jar,
    );
    expect(fifth.status).toBe(200);
    expect(fifth.json.me).toMatchObject({
      perches: 5,
      seeds: before.seeds - 650,
    });
    const full = await balance(id);
    const sixth = await client.post(
      { itemId: "perch", price: 400, actionId: crypto.randomUUID() },
      jar,
    );
    expect(sixth.status).toBe(409);
    expect(sixth.json.error.code).toBe("conflict");
    const after = await balance(id);
    expect(after).toEqual(full);
    expect(after.ledger).toBe(after.seeds);
  });

  it("answers a price the buyer did not see with 409 conflict and charges nothing", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", 1000);
    expect(
      (
        await client.post(
          { itemId: "perch", price: 250, actionId: crypto.randomUUID() },
          jar,
        )
      ).status,
    ).toBe(200);
    const before = await balance(id);
    const { status, json } = await client.post(
      { itemId: "perch", price: 250, actionId: crypto.randomUUID() },
      jar,
    );
    expect(status).toBe(409);
    expect(json.error).toEqual({
      code: "conflict",
      message: "The price changed. Take another look.",
    });
    expect(await balance(id)).toEqual(before);
  });

  it("charges once for two requests at once", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", 1000);
    const before = await balance(id);
    const statuses = (
      await Promise.all([
        client.post(
          { itemId: "goggles", price: 180, actionId: crypto.randomUUID() },
          jar,
        ),
        client.post(
          { itemId: "goggles", price: 180, actionId: crypto.randomUUID() },
          jar,
        ),
      ])
    )
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([200, 409]);
    expect((await balance(id)).seeds).toBe(before.seeds - 180);
  });

  it("charges only the caller, never someone else", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda", 1000);
    const { id, jar } = await onboarded("(555) 123-4567", "Max", 1000);
    const theirs = await balance(other.id);
    const { json } = await client.post(
      { itemId: "birdbath", price: 220, actionId: crypto.randomUUID() },
      jar,
    );
    expect(json.me.id).toBe(id);
    expect(await balance(other.id)).toEqual(theirs);
  });

  async function holdings(id: string) {
    const [row] = await deps.db.query<{
      seeds: number;
      espresso_shots: number;
      perches: number;
      gear: number;
      entries: number;
    }>(
      `select seeds, espresso_shots, perches,
         (select count(*)::int from gear_owned where user_id = $1) as gear,
         (select count(*)::int from seed_ledger where user_id = $1 and reason = 'shop') as entries
       from profiles where id = $1`,
      [id],
    );
    return row;
  }

  it.each([
    ["an espresso shot", "espresso", 25],
    ["a perch", "perch", 250],
    ["gear", "goggles", 180],
    ["the birdbath", "birdbath", 220],
  ])(
    "answers a replay of %s with 200 and the first committed state",
    async (_, itemId, price) => {
      const { id, jar } = await onboarded("(555) 123-4567", "Max", 1000);
      const body = { itemId, price, actionId: crypto.randomUUID() };
      const first = await client.post(body, jar);
      expect(first.status).toBe(200);
      const committed = await holdings(id);
      const replay = await client.post(body, jar);
      expect(replay.status).toBe(200);
      expect(replay.json.me).toEqual(first.json.me);
      expect(replay.json.closet).toEqual(first.json.closet);
      expect(await holdings(id)).toEqual(committed);
      const ledger = await deps.db.query<{ delta: number; ref_id: string }>(
        "select delta, ref_id from seed_ledger where user_id = $1 and reason = 'shop'",
        [id],
      );
      expect(ledger).toEqual([{ delta: -price, ref_id: body.actionId }]);
    },
  );

  it("charges once for the same buy sent twice at once", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", 1000);
    const before = await holdings(id);
    const body = {
      itemId: "espresso",
      price: 25,
      actionId: crypto.randomUUID(),
    };
    const answers = await Promise.all([
      client.post(body, jar),
      client.post(body, jar),
    ]);
    expect(answers.map((a) => a.status)).toEqual([200, 200]);
    expect(await holdings(id)).toEqual({
      ...before,
      seeds: before.seeds - 25,
      espresso_shots: 1,
      entries: 1,
    });
  });

  it("sells a second shot under a new actionId", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", 60);
    const buyShot = () =>
      client.post(
        { itemId: "espresso", price: 25, actionId: crypto.randomUUID() },
        jar,
      );
    const before = await holdings(id);
    expect((await buyShot()).status).toBe(200);
    expect((await buyShot()).status).toBe(200);
    expect(await holdings(id)).toMatchObject({
      seeds: before.seeds - 50,
      espresso_shots: 2,
      entries: 2,
    });
  });

  it("sells espresso shots again and again, stocking only the caller", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda", 1000);
    const { id, jar } = await onboarded("(555) 123-4567", "Max", 1000);
    const before = await balance(id);
    const theirs = await balance(other.id);
    const first = await client.post(
      { itemId: "espresso", price: 25, actionId: crypto.randomUUID() },
      jar,
    );
    expect(first.status).toBe(200);
    const second = await client.post(
      {
        itemId: "espresso",
        price: 25,
        actionId: crypto.randomUUID(),
        userId: other.id,
      },
      jar,
    );
    expect(second.status).toBe(400);
    const third = await client.post(
      { itemId: "espresso", price: 25, actionId: crypto.randomUUID() },
      jar,
    );
    expect(third.status).toBe(200);
    expect(third.json.me).toMatchObject({ id, seeds: before.seeds - 50 });
    const shots = await deps.db.query<{ id: string; espresso_shots: number }>(
      "select id, espresso_shots from profiles where id = any($1) order by id",
      [[id, other.id]],
    );
    expect(
      Object.fromEntries(shots.map((r) => [r.id, r.espresso_shots])),
    ).toEqual({
      [id]: 2,
      [other.id]: 0,
    });
    expect(await balance(other.id)).toEqual(theirs);
  });
});
