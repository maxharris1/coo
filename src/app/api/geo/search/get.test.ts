import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { geoSearchGet } from "./get";

const NOT_FOUND = "Could not find that place. Try a neighborhood or a city.";

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, geoSearchGet, "/api/geo/search");
});

function numbersIn(value: unknown, path = ""): string[] {
  if (typeof value === "number") return [path];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      numbersIn(v, `${path}.${k}`),
    );
  }
  return [];
}

describe("GET /api/geo/search", () => {
  it("refuses a request without a session", async () => {
    const { status, json } = await client.get({ q: "Boston" });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("answers an empty query with 400 invalid", async () => {
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get({ q: "  " }, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("returns place ids and labels with no coordinates (ac-3)", async () => {
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get({ q: "Boston" }, jar);
    expect(status).toBe(200);
    expect(json.results).toHaveLength(1);
    for (const result of json.results) {
      expect(Object.keys(result).sort()).toEqual([
        "kind",
        "label",
        "placeId",
        "sublabel",
      ]);
    }
    expect(json.results[0]).toMatchObject({
      label: "Boston",
      sublabel: "MA, United States",
      kind: "city",
    });
    expect(numbersIn(json)).toEqual([".serverNow"]);
    expect(JSON.stringify(json)).not.toMatch(/"(lat|lon|latitude|longitude)"/);
  });

  it("answers 200 with an empty list and the not-found message when the geocoder fails (ac-4)", async () => {
    vi.spyOn(deps.geocoder, "search").mockRejectedValue(
      new Error("photon down"),
    );
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get({ q: "Boston" }, jar);
    expect(status).toBe(200);
    expect(json.results).toEqual([]);
    expect(json.message).toBe(NOT_FOUND);
  });

  it("answers no match with the same message", async () => {
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get({ q: "Atlantis" }, jar);
    expect(status).toBe(200);
    expect(json).toMatchObject({ results: [], message: NOT_FOUND });
  });

  it("limits each user to 30 searches a minute (ac-5)", async () => {
    const me = await client.signIn("(555) 123-4567");
    const other = await client.signIn("(555) 765-4321");
    deps.clock.set(Date.UTC(2026, 10, 19, 15, 0, 0));

    for (let i = 0; i < 30; i++) {
      expect((await client.get({ q: "Boston" }, me.jar)).status).toBe(200);
    }
    const limited = await client.get({ q: "Boston" }, me.jar);
    expect(limited.status).toBe(429);
    expect(limited.json.error.code).toBe("rate_limited");

    expect((await client.get({ q: "Boston" }, other.jar)).status).toBe(200);

    deps.clock.advance(60_000);
    expect((await client.get({ q: "Boston" }, me.jar)).status).toBe(200);
  });

  it("counts searches that the geocoder fails toward the limit", async () => {
    const search = vi
      .spyOn(deps.geocoder, "search")
      .mockRejectedValue(new Error("down"));
    const { jar } = await client.signIn("(555) 123-4567");
    for (let i = 0; i < 30; i++) await client.get({ q: "Boston" }, jar);
    expect((await client.get({ q: "Boston" }, jar)).status).toBe(429);
    expect(search).toHaveBeenCalledTimes(30);
  });
});
