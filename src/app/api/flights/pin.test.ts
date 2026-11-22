import { snap } from "@/lib/game/privacy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { photon } from "@/server/adapters/photon";
import type { UserId } from "@/server/ports/auth";
import { searchPlaces } from "@/server/services/places";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { geoSearchGet } from "../geo/search/get";
import { flightsPost } from "./post";
import { quotePost } from "./quote/post";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: "pin-pepper" }),
}));

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
const TYPED = "200 Bedford Avenue";
const PIN = { lat: 40.714321987, lon: -73.961234567 };
const PIN_DIGITS = ["714321", "961234"];
const SNAPPED = snap(PIN.lat, PIN.lon);

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

const BEDFORD_AVE = feature(
  {
    osm_key: "building",
    osm_value: "yes",
    type: "house",
    housenumber: "200",
    street: "Bedford Avenue",
    locality: "Williamsburg",
    district: "Brooklyn",
    postcode: "11249",
  },
  [-73.9618, 40.7135],
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
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  deps.geocoder = photon({
    baseUrl: "https://photon.test",
    fetch: (async (input: RequestInfo | URL) =>
      Response.json({
        type: "FeatureCollection",
        features: [
          new URL(String(input)).pathname === "/api"
            ? BEDFORD_AVE
            : WILLIAMSBURG,
        ],
      })) as typeof fetch,
  })(deps.db, deps.clock) as TestDeps["geocoder"];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function everyStoredRow(): Promise<string> {
  const tables = await deps.db.query<{ schema: string; name: string }>(
    `select table_schema as schema, table_name as name
     from information_schema.tables
     where table_type = 'BASE TABLE'
       and table_schema not in ('pg_catalog', 'information_schema')`,
  );
  const rows = await Promise.all(
    tables.map(({ schema, name }) =>
      deps.db.query<{ row: string }>(
        `select t::text as row from "${schema}"."${name}" t`,
      ),
    ),
  );
  return rows
    .flat()
    .map(({ row }) => row)
    .join("\n");
}

describe("a pinned guest send over HTTP", () => {
  it("flies to the snapped pin under a neighbourhood label, with no address or drop point anywhere (ac-2)", async () => {
    const consoles = CONSOLE_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const search = geoClient(deps, geoSearchGet, "/api/geo/search");
    const { jar } = await search.signIn("+15550000001");
    const found = await search.get({ q: TYPED }, jar);
    expect(found.status).toBe(200);
    const placeId: string = found.json.results[0].placeId;

    const quoted = await geoClient(deps, quotePost, "/api/flights/quote").post(
      { recipients: [{ place: { placeId, pin: PIN } }] },
      jar,
    );
    expect(quoted.status).toBe(200);
    expect(quoted.json.recipients[0].to).toEqual({ label: "Williamsburg" });

    const sent = await geoClient(deps, flightsPost, "/api/flights").post(
      {
        body: "Come see the new loft",
        sends: [
          {
            guest: { name: "Sam", placeId, pin: PIN },
            birdId: world.max.birds[0].id,
          },
        ],
      },
      jar,
    );
    expect(sent.status).toBe(200);
    expect(sent.json.flights[0].to).toEqual({
      ...SNAPPED,
      label: "Williamsburg",
    });

    const [stored] = await deps.db.query<{
      to_lat: number;
      to_lon: number;
      dest_lat: number;
      dest_lon: number;
    }>(
      `select f.to_lat, f.to_lon, g.dest_lat, g.dest_lon
       from flights f join guest_links g on g.id = f.guest_link_id
       where f.id = $1`,
      [sent.json.flights[0].id],
    );
    expect(stored).toEqual({
      to_lat: SNAPPED.lat,
      to_lon: SNAPPED.lon,
      dest_lat: SNAPPED.lat,
      dest_lon: SNAPPED.lon,
    });

    const responses = JSON.stringify([found.json, quoted.json, sent.json]);
    const rows = await everyStoredRow();
    const logged = JSON.stringify(consoles.map((spy) => spy.mock.calls));
    for (const text of [responses, rows, logged]) {
      expect(text).not.toContain("Bedford");
      expect(text).not.toContain("11249");
    }
    for (const text of [JSON.stringify(sent.json), rows, logged])
      for (const digits of PIN_DIGITS) expect(text).not.toContain(digits);
    const cache = await deps.db.query<{ key: string; payload: unknown }>(
      "select key, payload from geo_cache",
    );
    const cached = JSON.stringify(cache);
    for (const digits of PIN_DIGITS) {
      expect(logged).not.toContain(digits);
      expect(cached).not.toContain(digits);
    }
  });

  it.each([
    ["a quote pin off the map", "/api/flights/quote", quotePost, { lat: 91 }],
    ["a send pin off the map", "/api/flights", flightsPost, { lon: -181 }],
  ])("refuses %s as invalid", async (_, path, build, bad) => {
    const client = geoClient(deps, build, path);
    const { id, jar } = await client.signIn("+15550000001");
    const placeId = (await searchPlaces(deps, id as UserId, TYPED)).results[0]
      .placeId;
    const before = await everyStoredRow();
    const pin = { ...PIN, ...bad };
    const body =
      path === "/api/flights"
        ? {
            body: "Hi",
            sends: [
              {
                guest: { name: "Sam", placeId: placeId, pin },
                birdId: world.max.birds[0].id,
              },
            ],
          }
        : { recipients: [{ place: { placeId: placeId, pin } }] };

    const { status, json } = await client.post(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await everyStoredRow()).toEqual(before);
  });
});
