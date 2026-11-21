import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { syncGet } from "../sync/get";
import { flightGet } from "./[id]/get";
import { flightsGet } from "./get";
import { flightsPost } from "./post";

const ROUTE = readFileSync(join(__dirname, "route.ts"), "utf8");
const EXPORTS = [
  "export const POST = flightsPost(jsonRoute);",
  "export const GET = flightsGet(jsonRoute);",
];

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

const getClient = () => geoClient(deps, flightsGet, "/api/flights");
const postClient = () => geoClient(deps, flightsPost, "/api/flights");

async function onboarded() {
  const session = await getClient().signIn("(555) 123-4567");
  await onboard(deps, session.id as UserId, {
    timezone: "America/New_York",
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
    name: "Max",
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return session;
}

describe("src/app/api/flights/route.ts", () => {
  it("holds only imports and the two handler exports", () => {
    const lines = ROUTE.split("\n").filter((line) => line.trim() !== "");
    const exports = lines.filter((line) => !line.startsWith("import "));
    expect(exports.sort()).toEqual([...EXPORTS].sort());
  });

  it("defines no handler logic", () => {
    expect(ROUTE).not.toMatch(/=>|\bfunction\b|\basync\b/);
  });
});

describe("GET /api/flights", () => {
  it("answers an onboarded caller with empty sections and no next page", async () => {
    const { jar } = await onboarded();
    const { status, json } = await getClient().get({}, jar);
    expect(status).toBe(200);
    expect(json).toEqual({
      yours: [],
      incoming: [],
      landedToday: [],
      earlier: [],
      nextCursor: null,
      serverNow: deps.clock.now(),
    });
  });

  it("answers a malformed cursor with 400 invalid", async () => {
    const { jar } = await onboarded();
    const { status, json } = await getClient().get({ cursor: "nope" }, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await getClient().get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});

describe("POST /api/flights", () => {
  const BODY = "Bring the good bagels on Sunday";
  const PHONE = { max: "+15550000001", priya: "+15550000002" };
  let world: World;

  beforeEach(async () => {
    world = await seedWorld(deps.db, deps.clock.now());
  });

  const jarOf = async (who: keyof typeof PHONE) =>
    (await postClient().signIn(PHONE[who])).jar;

  const gerald = () => world.max.birds[0].id;

  const sendGerald = async (body: string) =>
    postClient().post(
      { body, sends: [{ friendId: world.priya.id, birdId: gerald() }] },
      await jarOf("max"),
    );

  async function dress(gear: string[]) {
    await deps.db.query(
      "insert into gear_owned (user_id, gear_id) select $1, unnest($2::text[]) on conflict do nothing",
      [world.max.id, gear],
    );
    await deps.db.query(
      "update birds set breed = 'city', gear = $2 where id = $1",
      [gerald(), gear],
    );
  }

  async function counts() {
    const [row] = await deps.db.query<{ notes: number; flights: number }>(
      `select (select count(*)::int from notes) as notes,
         (select count(*)::int from flights) as flights`,
    );
    return row;
  }

  it("sends a note and answers with the flying flight", async () => {
    const { status, json } = await sendGerald(BODY);
    expect(status).toBe(200);
    expect(json.serverNow).toBe(deps.clock.now());
    expect(json.flights).toHaveLength(1);
    expect(json.flights[0]).toMatchObject({
      role: "mine",
      status: "flying",
      hasNote: true,
    });
  });

  it("shows the recipient the incoming flight with hasNote and no body", async () => {
    const { json: sent } = await sendGerald(BODY);
    const flightId = sent.flights[0].id;
    const priya = await jarOf("priya");

    const sync = await geoClient(deps, syncGet, "/api/sync").get({}, priya);
    expect(sync.status).toBe(200);
    const incoming = sync.json.flights.find(
      (f: { id: string }) => f.id === flightId,
    );
    expect(incoming).toMatchObject({ role: "incoming", hasNote: true });
    expect(JSON.stringify(sync.json)).not.toContain(BODY);

    const one = await geoClient(
      deps,
      flightGet,
      `/api/flights/${flightId}`,
    ).get({}, priya);
    expect(one.status).toBe(200);
    expect(one.json.flight).toMatchObject({ role: "incoming", hasNote: true });
    expect(JSON.stringify(one.json)).not.toContain(BODY);
  });

  it.each([
    ["141 characters on a plain bird", 400, [], 141],
    ["140 characters on a plain bird", 200, [], 140],
    ["280 characters with the tube", 200, ["tube"], 280],
    ["281 characters with the tube", 400, ["tube"], 281],
  ])("answers %s with %i", async (_, expected, gear, length) => {
    await dress(gear);
    const before = await counts();

    const { status, json } = await sendGerald("a".repeat(length));

    expect(status).toBe(expected);
    if (expected === 400) {
      expect(json.error.code).toBe("invalid");
      expect(json.error.message).toMatch(/^body/);
      expect(await counts()).toEqual(before);
    } else {
      expect(await counts()).toEqual({
        notes: before.notes + 1,
        flights: before.flights + 1,
      });
    }
  });

  it("counts an emoji as one character", async () => {
    await dress([]);
    const { status } = await sendGerald("🐦".repeat(140));
    expect(status).toBe(200);
  });

  it("refuses a send to someone who is not a friend as forbidden", async () => {
    const { status, json } = await postClient().post(
      {
        body: BODY,
        sends: [{ friendId: world.rosa.id, birdId: world.priya.birds[0].id }],
      },
      await jarOf("priya"),
    );
    expect(status).toBe(403);
    expect(json.error.code).toBe("forbidden");
  });

  it("answers someone else's bird as not_found", async () => {
    const { status, json } = await postClient().post(
      {
        body: BODY,
        sends: [{ friendId: world.priya.id, birdId: world.priya.birds[0].id }],
      },
      await jarOf("max"),
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it.each([
    [
      "no body field",
      () => ({ sends: [{ friendId: world.priya.id, birdId: gerald() }] }),
    ],
    ["no sends", () => ({ body: BODY, sends: [] })],
    [
      "a friendId that is not a uuid",
      () => ({ body: BODY, sends: [{ friendId: "priya", birdId: gerald() }] }),
    ],
    [
      "a release time",
      () => ({
        body: BODY,
        sends: [{ friendId: world.priya.id, birdId: gerald() }],
        releaseAt: deps.clock.now() + 60_000,
      }),
    ],
    [
      "a guest send",
      () => ({
        body: BODY,
        sends: [{ guest: { name: "Sam", placeId: "p1" }, birdId: gerald() }],
      }),
    ],
    [
      "two sends",
      () => ({
        body: BODY,
        sends: [
          { friendId: world.priya.id, birdId: gerald() },
          { friendId: world.rosa.id, birdId: world.max.birds[1].id },
        ],
      }),
    ],
  ])("refuses %s as invalid", async (_, body) => {
    const before = await counts();
    const { status, json } = await postClient().post(
      body(),
      await jarOf("max"),
    );
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await counts()).toEqual(before);
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await postClient().post({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});
