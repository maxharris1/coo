import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { photon } from "@/server/adapters/photon";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import type { HeldPlace, PlaceResult } from "@/server/services/places";
import { geoSearchGet } from "./get";

const NOT_FOUND = "Could not find that place. Try a neighborhood or a city.";
const UNAVAILABLE =
  "The map is slow to answer right now. Try again in a moment.";

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

  it("answers an address search with the neighbourhood only (f-1)", async () => {
    vi.spyOn(deps.geocoder, "search").mockResolvedValue([
      {
        label: "123 Bedford Avenue",
        sublabel: "Apartment 4B, Brooklyn, New York, NY 11211",
        kind: "address",
        lat: 40.7178,
        lon: -73.9574,
        city: "New York",
        region: "NY",
        countryCode: "US",
        area: { city: "New York", stateCode: "NY", countryCode: "US" },
      },
    ]);
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get({ q: "123 Bedford Avenue" }, jar);
    expect(status).toBe(200);
    expect(json.results).toEqual([
      {
        placeId: expect.any(String),
        label: "Williamsburg",
        sublabel: "New York, NY",
        kind: "neighbourhood",
      },
    ]);
    const stored = await deps.db.query<{ payload: { place: HeldPlace } }>(
      "select payload from geo_cache",
    );
    const placeText = [
      ...json.results.flatMap((r: PlaceResult) => [r.label, r.sublabel]),
      ...stored.flatMap(({ payload: { place } }) => [
        place.label,
        place.sublabel,
        place.city,
        place.region,
        place.country,
      ]),
    ].join("\n");
    expect(placeText).toContain("Williamsburg");
    expect(placeText).not.toMatch(/Bedford|123|Apartment|4B|11211/);
  });

  it("answers 503 unavailable, not the not-found message, when the geocoder fails (ac-4)", async () => {
    vi.spyOn(deps.geocoder, "search").mockRejectedValue(
      new Error("photon down"),
    );
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get({ q: "Boston" }, jar);
    expect(status).toBe(503);
    expect(json.error.code).toBe("unavailable");
    expect(json.error.message).toBe(UNAVAILABLE);
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

type Answer = (signal: AbortSignal) => Promise<Response>;

const after =
  (ms: number, body: unknown, status = 200): Answer =>
  (signal) =>
    new Promise((resolve, reject) => {
      setTimeout(() => resolve(Response.json(body, { status })), ms);
      signal.addEventListener("abort", () => reject(signal.reason));
    });

const never: Answer = (signal) =>
  new Promise((_, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason)),
  );

const feature = (lon: number, lat: number, properties: object) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties,
});

const collection = (...features: unknown[]) => ({
  type: "FeatureCollection",
  features,
});

const BEDFORD_HOUSE = feature(-73.9574, 40.7178, {
  osm_key: "building",
  osm_value: "yes",
  type: "house",
  housenumber: "123",
  street: "Bedford Avenue",
  locality: "Williamsburg",
  city: "New York",
  state: "New York",
  country: "United States",
  countrycode: "US",
});

const WILLIAMSBURG = feature(-73.96143, 40.71427, {
  osm_key: "place",
  osm_value: "suburb",
  type: "district",
  name: "Williamsburg",
  city: "New York",
  state: "New York",
  country: "United States",
  countrycode: "US",
});

const NEW_YORK = feature(-74.006, 40.7127, {
  osm_key: "place",
  osm_value: "city",
  type: "city",
  name: "New York",
  state: "New York",
  country: "United States",
  countrycode: "US",
});

const ADDRESS_TEXT = /Bedford|\b123\b/;

describe("GET /api/geo/search through Photon", () => {
  let photonClient: ReturnType<typeof geoClient>;
  let answers: Record<string, Answer>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    answers = {};
    const geocoder = photon({
      baseUrl: "https://photon.test",
      fetch: async (input, init) =>
        answers[new URL(String(input)).pathname](init!.signal!),
    })(deps.db, deps.clock);
    photonClient = geoClient(
      deps,
      geoSearchGet,
      "/api/geo/search",
      createJsonRoute(async () => ({ ...deps, geocoder })),
    );
  });

  afterEach(() => vi.useRealTimers());

  async function search(q: string) {
    const { jar } = await photonClient.signIn("(555) 123-4567");
    let done = false;
    const answer = photonClient.get({ q }, jar).finally(() => (done = true));
    while (!done) {
      await vi.advanceTimersByTimeAsync(100);
      await new Promise((resolve) => setImmediate(resolve));
    }
    return answer;
  }

  async function storedText() {
    return JSON.stringify(await deps.db.query("select payload from geo_cache"));
  }

  it.each([
    ["answers in 1.5 seconds", after(1500, collection(WILLIAMSBURG))],
    ["never answers", never],
  ])(
    "turns a slow address search into its neighbourhood when reverse %s (ac-1)",
    async (_, reverse) => {
      answers["/api"] = after(1500, collection(BEDFORD_HOUSE));
      answers["/reverse"] = reverse;

      const { status, json } = await search("123 Bedford Avenue");

      expect(status).toBe(200);
      expect(json.results).toEqual([
        expect.objectContaining({
          kind: "neighbourhood",
          label: "Williamsburg",
          sublabel: "New York, NY",
        }),
      ]);
      expect(JSON.stringify(json)).not.toMatch(ADDRESS_TEXT);
      expect(await storedText()).not.toMatch(ADDRESS_TEXT);
    },
  );

  it("finds a city that Photon answers in 1.5 seconds (ac-2)", async () => {
    answers["/api"] = after(1500, collection(NEW_YORK));

    const { status, json } = await search("New York");

    expect(status).toBe(200);
    expect(json.results).toEqual([
      expect.objectContaining({ kind: "city", label: "New York" }),
    ]);
  });

  it.each([
    ["answers 503", after(10, { message: "busy" }, 503)],
    ["hangs past three seconds", never],
  ])("says try again when Photon %s (ac-3)", async (_, api) => {
    answers["/api"] = api;

    const { status, json } = await search("Williamsburg");

    expect(status).toBe(503);
    expect(json.error).toEqual({ code: "unavailable", message: UNAVAILABLE });
    expect(JSON.stringify(json)).not.toContain(NOT_FOUND);
  });

  it("says not found only when Photon answers with nothing (ac-3)", async () => {
    answers["/api"] = after(10, collection());

    const { status, json } = await search("Atlantis");

    expect(status).toBe(200);
    expect(json).toMatchObject({ results: [], message: NOT_FOUND });
  });
});
