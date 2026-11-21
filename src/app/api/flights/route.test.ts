import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
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
  it("answers an onboarded caller with 404 until flights are built", async () => {
    const { jar } = await onboarded();
    const { status, json } = await getClient().get({}, jar);
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await getClient().get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});

describe("POST /api/flights", () => {
  it("answers an onboarded caller with 404 until flights are built", async () => {
    const { jar } = await onboarded();
    const { status, json } = await postClient().post({}, jar);
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await postClient().post({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});
