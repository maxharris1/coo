import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { aviaryGet } from "./get";

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, aviaryGet, "/api/aviary");
});

async function onboarded(number: string, name: string, birdName: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, {
    timezone: "America/New_York",
    name,
    bird: { name: birdName, look: "gerald", pronoun: "he" },
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return session;
}

async function birdIdsOf(userId: string) {
  const rows = await deps.db.query<{ id: string }>(
    "select id from birds where owner_id = $1 order by hatched_at, id",
    [userId],
  );
  return rows.map((r) => r.id);
}

async function openEggOf(userId: string) {
  const [row] = await deps.db.query<{ id: string }>(
    "select id from eggs where user_id = $1 and status <> 'hatched'",
    [userId],
  );
  return row.id;
}

describe("GET /api/aviary", () => {
  it("returns the caller's perches, open egg and breeds", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", "Gerald");

    const { status, json } = await client.get({}, jar);

    expect(status).toBe(200);
    expect(json.perches).toMatchObject({ total: 3, free: 2 });
    expect(json.perches.birds).toHaveLength(1);
    expect(json.perches.birds.map((b: { id: string }) => b.id)).toEqual(
      await birdIdsOf(id),
    );
    expect(json.perches.birds).toContainEqual({
      id: expect.any(String),
      name: "Gerald",
      breed: "city",
      look: "gerald",
    });
    expect(json.egg).toEqual({
      id: await openEggOf(id),
      status: "incubating",
      deliveriesToGo: config.game.eggs.firstAtDeliveries,
      waitingForPerch: false,
    });
    expect(json.breeds.map((b: { id: string }) => b.id)).toEqual(
      config.breeds.breeds.map((b) => b.id),
    );
  });

  it("shows each user only their own birds and egg", async () => {
    const max = await onboarded("(555) 123-4567", "Max", "Gerald");
    const brenda = await onboarded("(555) 765-4321", "Brenda", "Biscuit");

    const mine = await client.get({ userId: brenda.id }, max.jar);
    const theirs = await client.get({ userId: max.id }, brenda.jar);

    expect(mine.json.perches.birds.map((b: { id: string }) => b.id)).toEqual(
      await birdIdsOf(max.id),
    );
    expect(mine.json.egg.id).toBe(await openEggOf(max.id));
    expect(theirs.json.perches.birds.map((b: { id: string }) => b.id)).toEqual(
      await birdIdsOf(brenda.id),
    );
    expect(theirs.json.perches.birds).toContainEqual(
      expect.objectContaining({ name: "Biscuit" }),
    );
    expect(mine.json.perches.birds).not.toContainEqual(
      expect.objectContaining({ name: "Biscuit" }),
    );
    expect(theirs.json.egg.id).toBe(await openEggOf(brenda.id));
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});
