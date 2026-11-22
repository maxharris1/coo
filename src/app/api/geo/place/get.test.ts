import { beforeEach, describe, expect, it } from "vitest";
import { snap } from "@/lib/game/privacy";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { geoSearchGet } from "../search/get";
import { geoPlaceGet } from "./get";

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;
let search: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, geoPlaceGet, "/api/geo/place");
  search = geoClient(deps, geoSearchGet, "/api/geo/search");
});

async function heldBoston(number: string) {
  const { jar } = await client.signIn(number);
  const found = await search.get({ q: "Boston" }, jar);
  return { jar, placeId: found.json.results[0].placeId as string };
}

describe("GET /api/geo/place", () => {
  it("refuses a request without a session", async () => {
    const { placeId } = await heldBoston("(555) 123-4567");
    const { status, json } = await client.get({ placeId });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("returns only the held place's snapped starting point (ac-1)", async () => {
    const { jar, placeId } = await heldBoston("(555) 123-4567");
    const { status, json } = await client.get({ placeId }, jar);
    expect(status).toBe(200);
    expect(json).toEqual({
      start: snap(42.3601, -71.0589),
      serverNow: deps.clock.now(),
    });
    expect(Object.keys(json.start).sort()).toEqual(["lat", "lon"]);
    expect(JSON.stringify(json)).not.toMatch(/3601|0589|Boston/);
  });

  it("refuses someone else's placeId", async () => {
    const { placeId } = await heldBoston("(555) 123-4567");
    const { jar } = await client.signIn("(555) 987-6543");
    const { status, json } = await client.get({ placeId }, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(json.start).toBeUndefined();
  });

  it.each([[{}], [{ placeId: "" }], [{ placeId: "not-a-uuid" }]])(
    "answers %j with 400 invalid",
    async (query) => {
      const { jar } = await client.signIn("(555) 123-4567");
      const { status, json } = await client.get(query, jar);
      expect(status).toBe(400);
      expect(json.error.code).toBe("invalid");
    },
  );

  it("refuses an unknown or expired placeId", async () => {
    const { jar, placeId } = await heldBoston("(555) 123-4567");
    const unknown = await client.get(
      { placeId: "00000000-0000-4000-8000-000000000000" },
      jar,
    );
    expect(unknown.status).toBe(400);
    deps.clock.advance(10 * 60_000 + 1);
    const expired = await client.get({ placeId }, jar);
    expect(expired.status).toBe(400);
  });
});
