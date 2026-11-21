import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { collectionGet } from "./get";

const MAX_PHONE = "+15550000001";
const PRIYA_PHONE = "+15550000002";

let deps: TestDeps;
let world: World;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  client = geoClient(deps, collectionGet, "/api/collection");
});

async function seedPriya(badgeSql: string) {
  await deps.db.query(badgeSql, [world.priya.id]);
  await deps.db.query(
    `insert into postmarks (user_id, place_key, city, region, country)
     values ($1, 'erie|pa|us', 'Erie', 'PA', 'US')`,
    [world.priya.id],
  );
  await deps.db.query(
    "insert into bird_meetings (user_id, bird_id) values ($1, $2)",
    [world.priya.id, world.max.birds[0].id],
  );
}

describe("GET /api/collection", () => {
  it("returns my postmarks, every badge as n of goal, and birds met", async () => {
    await seedPriya(
      "insert into badges (user_id, badge_id, progress) values ($1, 'rfc-1149', 4)",
    );
    const { jar } = await client.signIn(PRIYA_PHONE);

    const { status, json } = await client.get({}, jar);

    expect(status).toBe(200);
    expect(json.serverNow).toBe(deps.clock.now());
    expect(json.badges).toHaveLength(12);
    expect(
      json.badges.find((b: { id: string }) => b.id === "rfc-1149"),
    ).toMatchObject({ progress: 4, goal: 9, earnedAt: null });
    expect(json.postmarks).toEqual([
      {
        city: "Erie",
        region: "PA",
        country: "US",
        earnedAt: expect.any(Number),
      },
    ]);
    expect(json.birdsMet).toBe(1);
  });

  it("never shows Max someone else's postmarks, badges or birds met", async () => {
    await seedPriya(
      "insert into badges (user_id, badge_id, progress, earned_at) values ($1, 'century', 1, now())",
    );
    const { jar } = await client.signIn(MAX_PHONE);

    const { status, json } = await client.get({}, jar);

    expect(status).toBe(200);
    expect(json.postmarks).toEqual([]);
    expect(json.birdsMet).toBe(0);
    expect(
      json.badges.every(
        (b: { earnedAt: number | null }) => b.earnedAt === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(json)).not.toContain("Erie");
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get({}, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });
});
