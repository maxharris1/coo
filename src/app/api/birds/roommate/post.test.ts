import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import type { Row } from "@/server/rows";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { birdsRoommatePost } from "./post";

const GERALD = { name: "Gerald", look: "gerald", pronoun: "he" };
const KEVIN = { name: "Kevin", look: "kevin", pronoun: "they" };
const PRETZEL = { name: "Pretzel", pronoun: "she" };

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, birdsRoommatePost, "/api/birds/roommate");
});

async function withProfile(number: string, bird = GERALD) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, {
    name: "Max",
    timezone: "America/New_York",
    bird,
  });
  return session;
}

async function markOnboarded(userId: string) {
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [userId, deps.clock.now()],
  );
}

async function keepOnly(userId: string, name: string) {
  await deps.db.query("delete from birds where owner_id = $1 and name <> $2", [
    userId,
    name,
  ]);
}

async function twoBirds(number: string) {
  const session = await withProfile(number);
  await markOnboarded(session.id);
  return session;
}

async function oneBird(number: string, bird = GERALD) {
  const session = await withProfile(number, bird);
  await markOnboarded(session.id);
  await keepOnly(session.id, bird.name);
  return session;
}

async function birdsOf(userId: string) {
  return deps.db.query<Row<"birds">>(
    "select * from birds where owner_id = $1 order by hatched_at, id",
    [userId],
  );
}

async function birdCount(userId: string) {
  return (await birdsOf(userId)).length;
}

async function seedsOf(userId: string) {
  const [row] = await deps.db.query<{ seeds: number }>(
    "select seeds from profiles where id = $1",
    [userId],
  );
  return row.seeds;
}

async function ledgerOf(userId: string) {
  return deps.db.query<{ id: number; delta: number; reason: string }>(
    "select id, delta, reason from seed_ledger where user_id = $1 order by id",
    [userId],
  );
}

async function eggsOf(userId: string) {
  return deps.db.query<Row<"eggs">>(
    "select * from eggs where user_id = $1 order by laid_at, id",
    [userId],
  );
}

describe("POST /api/birds/roommate", () => {
  it("adopts the second starter bird for free", async () => {
    const { id, jar } = await oneBird("(555) 123-4567");
    const ledger = await ledgerOf(id);
    const eggs = await eggsOf(id);

    const { status, json } = await client.post(PRETZEL, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({
      name: "Pretzel",
      pronoun: "she",
      look: "brenda",
      speedMph: 54,
      focus: 1,
      navigation: 3,
    });
    const birds = await birdsOf(id);
    expect(birds).toHaveLength(2);
    const row = birds.find((b) => b.id === json.bird.id);
    expect(row).toMatchObject({ belly: 80, feathers: 80, energy: 100 });
    expect(row?.quirks).toHaveLength(2);
    expect(await seedsOf(id)).toBe(60);
    expect(await ledgerOf(id)).toEqual(ledger);
    expect(eggs).toEqual([
      expect.objectContaining({ status: "incubating", hatch_at_delivery: 5 }),
    ]);
    expect(await eggsOf(id)).toEqual(eggs);
  });

  it("wraps the starter looks around after the last one", async () => {
    const { jar } = await oneBird("(555) 123-4567", KEVIN);
    const { status, json } = await client.post(PRETZEL, jar);
    expect(status).toBe(200);
    expect(json.bird.look).toBe("gerald");
  });

  it("refuses a second adoption as 409 conflict", async () => {
    const { id, jar } = await oneBird("(555) 123-4567");
    expect((await client.post(PRETZEL, jar)).status).toBe(200);

    const { status, json } = await client.post(
      { name: "Biscuit", pronoun: "he" },
      jar,
    );

    expect(status).toBe(409);
    expect(json.error).toMatchObject({
      code: "conflict",
      message: "You already have a roommate.",
    });
    expect(await birdCount(id)).toBe(2);
  });

  it("refuses a loft that already has both starter birds", async () => {
    const { id, jar } = await twoBirds("(555) 123-4567");
    const { status, json } = await client.post(PRETZEL, jar);
    expect(status).toBe(409);
    expect(json.error).toMatchObject({
      code: "conflict",
      message: "You already have a roommate.",
    });
    expect(await birdCount(id)).toBe(2);
  });

  it("refuses when every perch is taken", async () => {
    const { id, jar } = await oneBird("(555) 123-4567");
    await deps.db.query(
      "alter table profiles drop constraint profiles_perches_check",
    );
    await deps.db.query("update profiles set perches = 1 where id = $1", [id]);

    const { status, json } = await client.post(PRETZEL, jar);

    expect(status).toBe(409);
    expect(json.error).toMatchObject({
      code: "conflict",
      message: "Every perch is taken.",
    });
    expect(await birdCount(id)).toBe(1);
  });

  it("refuses a name the first bird already has", async () => {
    const { id, jar } = await oneBird("(555) 123-4567");
    const { status, json } = await client.post(
      { name: " gerald ", pronoun: "he" },
      jar,
    );
    expect(status).toBe(409);
    expect(json.error).toMatchObject({
      code: "conflict",
      message: "You already have a bird called Gerald.",
    });
    expect(await birdCount(id)).toBe(1);
    expect(await seedsOf(id)).toBe(60);
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.post(PRETZEL);
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { id, jar } = await withProfile("(555) 123-4567");
    await keepOnly(id, GERALD.name);
    const { status, json } = await client.post(PRETZEL, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
    expect(await birdCount(id)).toBe(1);
  });

  it.each([
    ["an unknown key", { ...PRETZEL, look: "kevin" }],
    ["an empty name", { name: "  ", pronoun: "she" }],
    ["a 25-character name", { name: "a".repeat(25), pronoun: "she" }],
    ["a NUL name", { name: "\u0000", pronoun: "they" }],
    ["an unknown pronoun", { name: "Pretzel", pronoun: "it" }],
  ])("answers %s with 400 invalid", async (_, body) => {
    const { id, jar } = await oneBird("(555) 123-4567");
    const { status, json } = await client.post(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await birdCount(id)).toBe(1);
  });

  it("adopts only into the caller's loft, never someone else's", async () => {
    const a = await oneBird("(555) 123-4567");
    const b = await oneBird("(555) 765-4321");
    const bEggs = await eggsOf(b.id);

    expect((await client.post(PRETZEL, a.jar)).status).toBe(200);
    expect(await birdCount(a.id)).toBe(2);
    expect(await birdCount(b.id)).toBe(1);
    expect(await seedsOf(b.id)).toBe(60);
    expect(await eggsOf(b.id)).toEqual(bEggs);

    const aimed = await client.post({ ...PRETZEL, ownerId: b.id }, a.jar);
    expect(aimed.status).toBe(400);
    expect(await birdCount(a.id)).toBe(2);
    expect(await birdCount(b.id)).toBe(1);

    expect((await client.post(PRETZEL, b.jar)).status).toBe(200);
    expect(await birdCount(b.id)).toBe(2);
    expect(await birdCount(a.id)).toBe(2);
  });
});
