import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { send } from "@/server/services/flights/send";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { flightCancelPost } from "./post";

const ROUTE = readFileSync(join(__dirname, "route.ts"), "utf8");
const PHONE = {
  max: "+15550000001",
  priya: "+15550000002",
  rosa: "+15550000003",
};
const HOUR_MS = 60 * 60 * 1000;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

async function scheduled(owner: keyof World, friend: keyof World) {
  const { flights } = await send(deps, world[owner].id as UserId, {
    body: "Coffee at seven, my treat",
    sends: [
      {
        friendId: world[friend].id as UserId,
        birdId: world[owner].birds[0].id,
      },
    ],
    releaseAt: deps.clock.now() + 9 * HOUR_MS,
  });
  return flights[0].id;
}

async function snapshot() {
  return {
    birds: await deps.db.query("select id, status from birds order by id"),
    notes: await deps.db.query("select id from notes order by id"),
    flights: await deps.db.query("select id, status from flights order by id"),
  };
}

const clientFor = (id: string) =>
  geoClient(deps, flightCancelPost, `/api/flights/${id}/cancel`);

async function post(who: keyof typeof PHONE, id: string) {
  const client = clientFor(id);
  const { jar } = await client.signIn(PHONE[who]);
  return client.post({}, jar);
}

describe("src/app/api/flights/[id]/cancel/route.ts", () => {
  it("holds only imports and the POST export", () => {
    const lines = ROUTE.split("\n").filter((line) => line.trim() !== "");
    const exports = lines.filter((line) => !line.startsWith("import "));
    expect(exports).toEqual([
      "export const POST = flightCancelPost(jsonRoute);",
    ]);
  });
});

describe("POST /api/flights/[id]/cancel", () => {
  it("cancels the owner's scheduled flight, frees the bird and drops the note (ac-1)", async () => {
    const flightId = await scheduled("max", "priya");

    const { status, json } = await post("max", flightId);

    expect(status).toBe(200);
    expect(json.flight).toMatchObject({
      id: flightId,
      status: "cancelled",
      role: "mine",
      hasNote: false,
    });
    const [bird] = await deps.db.query<{ status: string }>(
      "select status from birds where id = $1",
      [world.max.birds[0].id],
    );
    expect(bird.status).toBe("home");
    expect(await deps.db.query("select id from notes")).toEqual([]);
  });

  it("answers the counterpart with 404 not_found and changes nothing (ac-2)", async () => {
    const flightId = await scheduled("max", "priya");
    const before = await snapshot();

    const { status, json } = await post("priya", flightId);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await snapshot()).toEqual(before);
  });

  it("answers another user's flight with 404 not_found and changes nothing (ac-2)", async () => {
    const flightId = await scheduled("rosa", "max");
    const before = await snapshot();

    const { status, json } = await post("priya", flightId);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(JSON.stringify(json)).not.toContain(flightId);
    expect(await snapshot()).toEqual(before);
  });

  it("answers a second cancel with 409 conflict and changes nothing (ac-2)", async () => {
    const flightId = await scheduled("max", "priya");
    await post("max", flightId);
    const before = await snapshot();

    const { status, json } = await post("max", flightId);

    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(await snapshot()).toEqual(before);
  });

  it("answers a malformed id with 404 not_found", async () => {
    const { status, json } = await post("max", "not-a-uuid");
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("refuses a request without a session as 401", async () => {
    const flightId = await scheduled("max", "priya");
    const { status, json } = await clientFor(flightId).post({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});
