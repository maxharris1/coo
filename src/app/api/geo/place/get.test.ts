import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { photon } from "@/server/adapters/photon";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { geoSearchGet } from "../search/get";
import { geoPlaceGet } from "./get";

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
const TYPED = "123 Bedford Avenue";

function feature(properties: Record<string, string>, coordinates: number[]) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: {
      city: "New York",
      state: "New York",
      country: "United States",
      countrycode: "US",
      ...properties,
    },
  };
}

const BEDFORD_HOUSE = feature(
  {
    osm_key: "building",
    osm_value: "yes",
    type: "house",
    housenumber: "123",
    street: "Bedford Avenue",
    locality: "Williamsburg",
    postcode: "11249",
  },
  [-73.957412, 40.717834],
);

const WILLIAMSBURG = feature(
  {
    osm_key: "place",
    osm_value: "suburb",
    type: "district",
    name: "Williamsburg",
  },
  [-73.96143, 40.71427],
);

let deps: TestDeps;
let place: ReturnType<typeof geoClient>;
let search: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  deps.geocoder = photon({
    baseUrl: "https://photon.test",
    fetch: (async (input: RequestInfo | URL) =>
      Response.json({
        type: "FeatureCollection",
        features: [
          new URL(String(input)).pathname === "/api"
            ? BEDFORD_HOUSE
            : WILLIAMSBURG,
        ],
      })) as typeof fetch,
  })(deps.db, deps.clock) as TestDeps["geocoder"];
  place = geoClient(deps, geoPlaceGet, "/api/geo/place");
  search = geoClient(deps, geoSearchGet, "/api/geo/search");
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function heldBy(number: string) {
  const { jar } = await search.signIn(number);
  const found = await search.get({ q: TYPED }, jar);
  return { jar, placeId: found.json.results[0].placeId as string };
}

describe("GET /api/geo/place", () => {
  it("refuses a request without a session", async () => {
    const { placeId } = await heldBy("(555) 123-4567");
    const { status, json } = await place.get({ placeId });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("returns only the held place's snapped start to the placeId holder (ac-2)", async () => {
    const consoles = CONSOLE_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { jar, placeId } = await heldBy("(555) 123-4567");

    const { status, json } = await place.get({ placeId }, jar);

    expect(status).toBe(200);
    const { serverNow, ...body } = json;
    expect(serverNow).toBe(deps.clock.now());
    expect(body).toEqual({ start: { lat: 40.718, lon: -73.9575 } });

    const cache = await deps.db.query<{ key: string; payload: unknown }>(
      "select key, payload from geo_cache",
    );
    const logged = JSON.stringify(consoles.map((spy) => spy.mock.calls));
    for (const text of [JSON.stringify(json), JSON.stringify(cache), logged]) {
      expect(text).not.toContain("Bedford");
      expect(text).not.toContain(`"123"`);
      expect(text).not.toContain("11249");
      expect(text).not.toContain("717834");
      expect(text).not.toContain("957412");
    }
    expect(logged).not.toContain("40.718");
  });

  it("refuses someone else's placeId", async () => {
    const { placeId } = await heldBy("(555) 123-4567");
    const { jar } = await place.signIn("(555) 765-4321");

    const { status, json } = await place.get({ placeId }, jar);

    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(json.start).toBeUndefined();
  });

  it.each([[{ placeId: "not-a-uuid" }], [{ placeId: "" }], [{}]])(
    "answers %j with 400 invalid",
    async (query) => {
      const { jar } = await place.signIn("(555) 123-4567");
      const { status, json } = await place.get(query, jar);
      expect(status).toBe(400);
      expect(json.error.code).toBe("invalid");
    },
  );

  it("refuses a hold that has expired", async () => {
    const { jar, placeId } = await heldBy("(555) 123-4567");
    deps.clock.advance(11 * 60_000);

    const { status } = await place.get({ placeId }, jar);

    expect(status).toBe(400);
  });
});
