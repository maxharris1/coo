import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { quotePost } from "./post";

const ROUTE = readFileSync(join(__dirname, "route.ts"), "utf8");
const PRIYA = "00000000-0000-4000-8000-000000000002";
const PHONE = {
  max: "+15550000001",
  priya: "+15550000002",
  rosa: "+15550000003",
};

let deps: TestDeps;
let world: World;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  client = geoClient(deps, quotePost, "/api/flights/quote");
});

async function jarOf(who: keyof typeof PHONE) {
  return (await client.signIn(PHONE[who])).jar;
}

describe("src/app/api/flights/quote/route.ts", () => {
  it("holds only imports and the POST export", () => {
    const lines = ROUTE.split("\n").filter((line) => line.trim() !== "");
    const exports = lines.filter((line) => !line.startsWith("import "));
    expect(exports).toEqual(["export const POST = quotePost(jsonRoute);"]);
  });
});

describe("POST /api/flights/quote", () => {
  it("quotes a friend with my own bird", async () => {
    const gerald = world.max.birds[0].id;
    const { status, json } = await client.post(
      { recipients: [{ friendId: world.priya.id }], birdIds: [gerald] },
      await jarOf("max"),
    );
    expect(status).toBe(200);
    expect(json.serverNow).toBe(deps.clock.now());
    expect(json.recipients).toHaveLength(1);
    expect(json.recipients[0]).toMatchObject({
      recipient: { friendId: world.priya.id },
      from: { label: "East Village" },
      to: { label: "Center City" },
    });
    expect(json.recipients[0].quotes).toEqual([
      expect.objectContaining({ birdId: gerald, releaseAt: deps.clock.now() }),
    ]);
  });

  it("refuses to quote a non-friend as forbidden", async () => {
    const { status, json } = await client.post(
      { recipients: [{ friendId: world.rosa.id }] },
      await jarOf("priya"),
    );
    expect(status).toBe(403);
    expect(json.error.code).toBe("forbidden");
  });

  it("answers someone else's bird as not_found", async () => {
    const { status, json } = await client.post(
      {
        recipients: [{ friendId: world.priya.id }],
        birdIds: [world.priya.birds[0].id],
      },
      await jarOf("max"),
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.post({
      recipients: [{ friendId: world.priya.id }],
    });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it.each([
    ["no recipients field", {}],
    ["an empty recipients list", { recipients: [] }],
    ["a recipient that is neither friend nor place", { recipients: [{}] }],
    ["a friendId that is not a uuid", { recipients: [{ friendId: "priya" }] }],
    [
      "a release time that is not a number",
      { recipients: [{ friendId: PRIYA }], at: ["soon"] },
    ],
  ])("refuses %s as invalid", async (_, body) => {
    const { status, json } = await client.post(body, await jarOf("max"));
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });
});
