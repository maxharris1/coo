import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertFlyingDelivery } from "@/test/fixtures/flights";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { flightGet } from "./get";

const ROUTE = readFileSync(join(__dirname, "route.ts"), "utf8");
const PHONE = {
  max: "+15550000001",
  priya: "+15550000002",
  rosa: "+15550000003",
};

let deps: TestDeps;
let world: World;
let flightId: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  ({ flightId } = await insertFlyingDelivery(deps.db, world, deps.clock.now()));
});

const clientFor = (id: string) =>
  geoClient(deps, flightGet, `/api/flights/${id}`);

async function jarOf(who: keyof typeof PHONE) {
  return (await clientFor("x").signIn(PHONE[who])).jar;
}

describe("src/app/api/flights/[id]/route.ts", () => {
  it("holds only imports and the GET export", () => {
    const lines = ROUTE.split("\n").filter((line) => line.trim() !== "");
    const exports = lines.filter((line) => !line.startsWith("import "));
    expect(exports).toEqual(["export const GET = flightGet(jsonRoute);"]);
  });
});

describe("GET /api/flights/[id]", () => {
  it("gives the owner the flight as mine", async () => {
    const { status, json } = await clientFor(flightId).get(
      {},
      await jarOf("max"),
    );
    expect(status).toBe(200);
    expect(json.flight).toMatchObject({
      id: flightId,
      kind: "delivery",
      status: "flying",
      role: "mine",
      hasNote: true,
      owner: { id: world.max.id, name: "Max", handle: "max" },
      counterpart: { id: world.priya.id, name: "Priya", handle: "priya" },
      bird: { id: world.max.birds[0].id, name: "Gerald" },
      from: { label: "East Village" },
      to: { label: "Center City" },
      releaseAt: deps.clock.now(),
    });
  });

  it("gives the counterpart the flight as incoming", async () => {
    const { status, json } = await clientFor(flightId).get(
      {},
      await jarOf("priya"),
    );
    expect(status).toBe(200);
    expect(json.flight).toMatchObject({ id: flightId, role: "incoming" });
  });

  it("answers someone who is neither owner nor counterpart with 404 not_found", async () => {
    const { status, json } = await clientFor(flightId).get(
      {},
      await jarOf("rosa"),
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(JSON.stringify(json)).not.toContain(flightId);
  });

  it("answers a flight id that does not exist with 404 not_found", async () => {
    const { status, json } = await clientFor(
      "00000000-0000-4000-8000-0000000000ff",
    ).get({}, await jarOf("max"));
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("answers a malformed id with 404 not_found", async () => {
    const { status, json } = await clientFor("not-a-uuid").get(
      {},
      await jarOf("max"),
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await clientFor(flightId).get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});
