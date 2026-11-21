import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { foundObjects } from "@/server/services/jobs/found";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { foundTradePost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};
const [BUTTON, CAP] = config.foundObjects.objects;

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, foundTradePost, "/api/found/trade");
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
  const [bird] = await deps.db.query<{ id: string }>(
    "select id from birds where owner_id = $1 order by hatched_at, id limit 1",
    [session.id],
  );
  return { ...session, birdId: bird.id };
}

async function callerFor(userId: string): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [userId],
  );
  return { userId: userId as UserId, profile };
}

async function give(
  userId: string,
  birdId: string,
  object: { id: string; value: number },
) {
  await deps.db.query(
    `insert into found_objects (user_id, bird_id, object_id, value, source_id, found_at)
     values ($1, $2, $3, $4, gen_random_uuid(), $5)`,
    [userId, birdId, object.id, object.value, new Date(deps.clock.now())],
  );
}

async function seedsOf(userId: string) {
  const [row] = await deps.db.query<{ seeds: number }>(
    "select seeds from profiles where id = $1",
    [userId],
  );
  return row.seeds;
}

describe("POST /api/found/trade", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.post({}, undefined);
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.post({}, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });

  it("lists untraded found objects with their names", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    await give(max.id, max.birdId, BUTTON);

    expect(await foundObjects(deps, await callerFor(max.id))).toEqual([
      {
        id: expect.any(String),
        objectId: BUTTON.id,
        name: BUTTON.name,
        value: BUTTON.value,
        birdId: max.birdId,
      },
    ]);
  });

  it("ac-4: trading pays the sum of values once and empties the list", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    await give(max.id, max.birdId, BUTTON);
    await give(max.id, max.birdId, CAP);
    const before = await seedsOf(max.id);
    const sum = BUTTON.value + CAP.value;

    const { status, json } = await client.post({}, max.jar);

    expect(status).toBe(200);
    expect(json).toEqual({
      seeds: before + sum,
      traded: sum,
      serverNow: deps.clock.now(),
    });
    expect(await seedsOf(max.id)).toBe(before + sum);
    expect(await foundObjects(deps, await callerFor(max.id))).toEqual([]);

    const again = await client.post({}, max.jar);
    expect(again.status).toBe(200);
    expect(again.json).toEqual({
      seeds: before + sum,
      traded: 0,
      serverNow: deps.clock.now(),
    });
    expect(await seedsOf(max.id)).toBe(before + sum);
  });

  it("ac-4: trading with nothing found pays nothing", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const before = await seedsOf(max.id);

    const { status, json } = await client.post({}, max.jar);

    expect(status).toBe(200);
    expect(json).toEqual({
      seeds: before,
      traded: 0,
      serverNow: deps.clock.now(),
    });
  });

  it("never trades someone else's found objects", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const priya = await onboarded("(555) 987-6543", "Priya");
    await give(priya.id, priya.birdId, BUTTON);
    const priyaBefore = await seedsOf(priya.id);

    const { json } = await client.post({}, max.jar);

    expect(json.traded).toBe(0);
    expect(await seedsOf(priya.id)).toBe(priyaBefore);
    expect(await foundObjects(deps, await callerFor(priya.id))).toHaveLength(1);
    expect(await foundObjects(deps, await callerFor(max.id))).toEqual([]);
  });
});
