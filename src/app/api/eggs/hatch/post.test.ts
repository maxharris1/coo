import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import type { Row } from "@/server/rows";
import { onboard } from "@/server/services/onboarding";
import { buy } from "@/server/services/shop";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { eggsHatchPost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

const PRETZEL = { name: "Pretzel", pronoun: "she" };

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, eggsHatchPost, "/api/eggs/hatch");
});

async function withProfile(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  return session;
}

async function onboarded(number: string, name: string) {
  const session = await withProfile(number, name);
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  await deps.db.query("select apply_seeds($1, 1000, 'test', null)", [
    session.id,
  ]);
  return session;
}

async function deliverFive(userId: string) {
  await deps.db.query(
    "update profiles set deliveries_count = 5 where id = $1",
    [userId],
  );
  await deps.db.query(
    "update eggs set status = 'ready' where user_id = $1 and status = 'incubating' and hatch_at_delivery <= 5",
    [userId],
  );
}

async function fillPerches(userId: string) {
  await deps.db.query(
    `insert into birds (owner_id, name, breed, speed_mph, focus, navigation)
     values ($1, 'Extra', 'city', 45, 3, 3)`,
    [userId],
  );
}

async function eggsOf(userId: string) {
  return deps.db.query<Row<"eggs">>(
    "select * from eggs where user_id = $1 order by hatch_at_delivery",
    [userId],
  );
}

async function birdCount(userId: string) {
  const [row] = await deps.db.query<{ count: number }>(
    "select count(*)::int as count from birds where owner_id = $1",
    [userId],
  );
  return row.count;
}

describe("POST /api/eggs/hatch", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.post(PRETZEL);
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.post(PRETZEL, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });

  it.each([
    ["an empty body", {}],
    ["a missing pronoun", { name: "Pretzel" }],
    ["an empty name", { name: "  ", pronoun: "she" }],
    ["a 25-character name", { name: "a".repeat(25), pronoun: "she" }],
    ["an unknown pronoun", { name: "Pretzel", pronoun: "it" }],
    ["an unknown key", { ...PRETZEL, eggId: crypto.randomUUID() }],
    ["a NUL name", { name: "\u0000", pronoun: "they" }],
    ["a name with a NUL inside", { name: "Pre\u0000tzel", pronoun: "they" }],
  ])("answers %s with 400 invalid", async (_, body) => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    await deliverFive(id);
    const { status, json } = await client.post(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await birdCount(id)).toBe(2);
    expect((await eggsOf(id)).map((e) => e.status)).toEqual(["ready"]);
  });

  it("answers an egg that is not ready with 409 conflict", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.post(PRETZEL, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(await birdCount(id)).toBe(2);
  });

  it("walks scenario 11: no perch refused, buy a perch, hatch, next egg 25 deliveries on", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    await deliverFive(id);
    await fillPerches(id);

    const full = await client.post(PRETZEL, jar);
    expect(full.status).toBe(409);
    expect(full.json.error.code).toBe("conflict");
    expect(await birdCount(id)).toBe(3);
    expect((await eggsOf(id)).map((e) => e.status)).toEqual(["ready"]);

    await buy(deps, id as UserId, { itemId: "perch", price: 250 });

    const { status, json } = await client.post(PRETZEL, jar);
    expect(status).toBe(200);
    expect(json.bird).toMatchObject({ name: "Pretzel", pronoun: "she" });
    expect(json.egg).toEqual({
      id: expect.any(String),
      status: "incubating",
      deliveriesToGo: 25,
    });
    expect(await birdCount(id)).toBe(4);
    const [old, next] = await eggsOf(id);
    expect(old).toMatchObject({ status: "hatched", bird_id: json.bird.id });
    expect(next).toMatchObject({
      id: json.egg.id,
      status: "incubating",
      hatch_at_delivery: 30,
    });

    const again = await client.post(PRETZEL, jar);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("conflict");
    expect(await birdCount(id)).toBe(4);
  });

  it("hatches only the caller's egg, never someone else's", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda");
    await deliverFive(other.id);
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.post(PRETZEL, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(await birdCount(id)).toBe(2);
    expect(await birdCount(other.id)).toBe(2);
    expect((await eggsOf(other.id)).map((e) => e.status)).toEqual(["ready"]);
  });
});
