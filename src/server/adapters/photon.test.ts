import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { FakeClock } from "@/test/fakes/clock";
import { testDb } from "@/test/testDb";
import { photon } from "./photon";

const BASE = "https://photon.test";
const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 20, 12);

const WILLIAMSBURG = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-73.96143, 40.71427] },
  properties: {
    osm_type: "N",
    osm_id: 2834361543,
    osm_key: "place",
    osm_value: "suburb",
    type: "district",
    name: "Williamsburg",
    postcode: "11211",
    city: "New York",
    county: "Kings County",
    state: "New York",
    country: "United States",
    countrycode: "US",
    extent: [-73.9737, 40.7225, -73.9364, 40.6984],
  },
};

const PHILADELPHIA = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-75.1635262, 39.9527237] },
  properties: {
    osm_type: "R",
    osm_id: 188022,
    osm_key: "place",
    osm_value: "city",
    type: "city",
    name: "Philadelphia",
    county: "Philadelphia County",
    state: "Pennsylvania",
    country: "United States",
    countrycode: "US",
  },
};

const BEDFORD_AVE = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-73.9618, 40.7135] },
  properties: {
    osm_type: "N",
    osm_id: 4412237891,
    osm_key: "building",
    osm_value: "yes",
    type: "house",
    housenumber: "200",
    street: "Bedford Avenue",
    locality: "Williamsburg",
    district: "Brooklyn",
    postcode: "11249",
    city: "New York",
    county: "Kings County",
    state: "New York",
    country: "United States",
    countrycode: "US",
  },
};

const MALFORMED = {
  type: "Feature",
  geometry: { type: "Point" },
  properties: { name: "Nowhere" },
};

function collection(...features: unknown[]) {
  return { type: "FeatureCollection", features };
}

function stubFetch(body: unknown = collection()) {
  const urls: URL[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    urls.push(new URL(String(input)));
    return Response.json(body);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, urls };
}

let db: Db;
let clock: FakeClock;

beforeEach(async () => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
  db = await testDb();
  clock = new FakeClock(START);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("photon search", () => {
  it("asks /api for six English results and maps them to snapped hits", async () => {
    const { fetch, urls } = stubFetch(
      collection(WILLIAMSBURG, PHILADELPHIA, BEDFORD_AVE, MALFORMED),
    );
    const geocoder = photon({ baseUrl: BASE, fetch })(db, clock);

    const hits = await geocoder.search("Williamsburg Brooklyn");

    expect(urls).toHaveLength(1);
    expect(urls[0].origin + urls[0].pathname).toBe(`${BASE}/api`);
    expect(Object.fromEntries(urls[0].searchParams)).toEqual({
      q: "williamsburg brooklyn",
      limit: "6",
      lang: "en",
    });
    expect(hits).toEqual([
      {
        kind: "neighbourhood",
        label: "Williamsburg",
        sublabel: "New York, NY",
        lat: 40.714,
        lon: -73.9625,
        city: "New York",
        region: "NY",
        country: "United States",
        countryCode: "US",
      },
      {
        kind: "city",
        label: "Philadelphia",
        sublabel: "PA",
        lat: 39.952,
        lon: -75.1625,
        city: "Philadelphia",
        region: "PA",
        country: "United States",
        countryCode: "US",
      },
      {
        kind: "address",
        label: "200 Bedford Avenue",
        sublabel: "Brooklyn, New York, NY",
        lat: 40.714,
        lon: -73.9625,
        city: "New York",
        region: "NY",
        country: "United States",
        countryCode: "US",
      },
    ]);
  });

  it("names the country outside the US and keeps the full state name", async () => {
    const { fetch } = stubFetch(
      collection({
        type: "Feature",
        geometry: { type: "Point", coordinates: [-79.3839347, 43.6534817] },
        properties: {
          osm_key: "place",
          osm_value: "city",
          type: "city",
          name: "Toronto",
          state: "Ontario",
          country: "Canada",
          countrycode: "CA",
        },
      }),
    );
    const [hit] = await photon({ baseUrl: BASE, fetch })(db, clock).search(
      "toronto",
    );
    expect(hit).toEqual({
      kind: "city",
      label: "Toronto",
      sublabel: "Ontario, Canada",
      lat: 43.654,
      lon: -79.385,
      city: "Toronto",
      region: "Ontario",
      country: "Canada",
      countryCode: "CA",
    });
  });
});

describe("photon reverse", () => {
  it("asks /reverse with the given point and maps the first feature to a name", async () => {
    const { fetch, urls } = stubFetch(collection(BEDFORD_AVE, WILLIAMSBURG));
    const geocoder = photon({ baseUrl: BASE, fetch })(db, clock);

    const name = await geocoder.reverse(40.714, -73.9625);

    expect(urls).toHaveLength(1);
    expect(urls[0].origin + urls[0].pathname).toBe(`${BASE}/reverse`);
    expect(Object.fromEntries(urls[0].searchParams)).toEqual({
      lat: "40.714",
      lon: "-73.9625",
      limit: "1",
      lang: "en",
    });
    expect(name).toEqual({
      neighbourhood: "Williamsburg",
      suburb: "Brooklyn",
      city: "New York",
      state: "New York",
      stateCode: "NY",
      country: "United States",
      countryCode: "US",
    });
  });

  it("names a city from the feature itself when it is the city", async () => {
    const { fetch } = stubFetch(collection(PHILADELPHIA));
    const name = await photon({ baseUrl: BASE, fetch })(db, clock).reverse(
      39.952,
      -75.1625,
    );
    expect(name).toEqual({
      city: "Philadelphia",
      state: "Pennsylvania",
      stateCode: "PA",
      country: "United States",
      countryCode: "US",
    });
  });

  it("returns null when nothing is there", async () => {
    const { fetch } = stubFetch(collection());
    const geocoder = photon({ baseUrl: BASE, fetch })(db, clock);
    expect(await geocoder.reverse(0, -30)).toBeNull();
  });
});

describe("photon geo_cache", () => {
  it("stores only snapped coordinates", async () => {
    const { fetch } = stubFetch(collection(WILLIAMSBURG, PHILADELPHIA));
    await photon({ baseUrl: BASE, fetch })(db, clock).search("williamsburg");

    const rows = await db.query<{ key: string; payload: unknown }>(
      "select key, payload from geo_cache",
    );
    expect(rows.map((r) => r.key)).toEqual(["search:williamsburg"]);
    const stored = JSON.stringify(rows[0].payload);
    for (const raw of ["71427", "96143", "9527237", "1635262"]) {
      expect(stored).not.toContain(raw);
    }
    expect(stored).toContain("40.714");
  });

  it("serves a repeated search from the cache for a day", async () => {
    const { fetch, urls } = stubFetch(collection(WILLIAMSBURG));
    const geocoder = photon({ baseUrl: BASE, fetch })(db, clock);

    const first = await geocoder.search("Williamsburg Brooklyn");
    clock.advance(DAY - 1);
    expect(await geocoder.search("  williamsburg   BROOKLYN ")).toEqual(first);
    expect(urls).toHaveLength(1);

    clock.advance(2);
    expect(await geocoder.search("williamsburg brooklyn")).toEqual(first);
    expect(urls).toHaveLength(2);
  });

  it("serves a nearby reverse lookup from the cache for 30 days", async () => {
    const { fetch, urls } = stubFetch(collection(BEDFORD_AVE));
    const geocoder = photon({ baseUrl: BASE, fetch })(db, clock);

    const first = await geocoder.reverse(40.714, -73.9625);
    clock.advance(30 * DAY - 1);
    expect(await geocoder.reverse(40.716, -73.96)).toEqual(first);
    expect(urls).toHaveLength(1);

    clock.advance(2);
    expect(await geocoder.reverse(40.716, -73.96)).toEqual(first);
    expect(urls).toHaveLength(2);
  });

  it("caches an empty reverse answer", async () => {
    const { fetch, urls } = stubFetch(collection());
    const geocoder = photon({ baseUrl: BASE, fetch })(db, clock);
    expect(await geocoder.reverse(-0.01, -0.01)).toBeNull();
    expect(await geocoder.reverse(0.01, 0.01)).toBeNull();
    expect(urls).toHaveLength(1);
    const rows = await db.query<{ key: string }>("select key from geo_cache");
    expect(rows.map((r) => r.key)).toEqual(["reverse:0.00,0.00"]);
  });
});

describe("photon failures", () => {
  it.each([
    ["a 500", async () => new Response("down", { status: 500 })],
    ["a thrown error", async () => Promise.reject(new TypeError("offline"))],
    ["a body that is not JSON", async () => new Response("<html>")],
    ["a body that is not a collection", async () => Response.json({ a: 1 })],
  ])("rejects on %s and does not cache it", async (_, fail) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(fail)
      .mockImplementationOnce(async () =>
        Response.json(collection(WILLIAMSBURG)),
      );
    const geocoder = photon({ baseUrl: BASE, fetch })(db, clock);

    await expect(geocoder.search("williamsburg")).rejects.toThrow();
    expect(await db.query("select key from geo_cache")).toEqual([]);
    expect(await geocoder.search("williamsburg")).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("photon limits", () => {
  it("keeps at most three requests in flight across geocoders", async () => {
    const pending: (() => void)[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          pending.push(() => {
            inFlight--;
            resolve(Response.json(collection(WILLIAMSBURG)));
          });
        }),
    );
    let cacheReads = 0;
    const counting = (inner: Db): Db => ({
      ...inner,
      async query<T>(sql: string, params?: unknown[]) {
        const rows = await inner.query<T>(sql, params);
        if (sql.startsWith("select")) cacheReads++;
        return rows;
      },
    });
    const make = photon({ baseUrl: BASE, fetch });
    const a = make(counting(db), clock);
    const b = make(counting(await testDb()), clock);

    const search = (q: string, i: number) => (i % 2 ? a : b).search(q);
    const first = ["one", "two", "three", "four"].map(search);
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    pending.shift()!();
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    const later = ["five", "six"].map(search);
    await vi.waitFor(() => expect(cacheReads).toBe(6));
    expect(pending).toHaveLength(3);
    for (let done = 1; done < 6; done++) {
      await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
      expect(inFlight).toBeLessThanOrEqual(3);
      pending.shift()!();
    }

    expect(await Promise.all([...first, ...later])).toHaveLength(6);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBe(3);
  });

  it("gives up on a request after one second", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let started!: () => void;
    const fetchStarted = new Promise<void>((resolve) => (started = resolve));
    const fetch = vi.fn(
      (_: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          started();
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const geocoder = photon({ baseUrl: BASE, fetch })(db, clock);

    let settled = false;
    const result = geocoder.search("slow").finally(() => (settled = true));
    result.catch(() => {});
    await fetchStarted;

    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).rejects.toThrow();
    expect(await db.query("select key from geo_cache")).toEqual([]);
  });
});
