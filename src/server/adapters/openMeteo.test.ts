import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { FakeClock } from "@/test/fakes/clock";
import recorded from "@/test/fixtures/open-meteo-forecast.json";
import { testDb } from "@/test/testDb";
import { openMeteo } from "./openMeteo";

const BASE = "https://weather.test";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = recorded[0].current.time * 1000;
const IN_3H = Date.UTC(2026, 10, 20, 19);

const MANHATTAN = { lat: 40.7128, lon: -73.9861 };
const PHILADELPHIA = { lat: 39.9127, lon: -75.1843 };

type Location = (typeof recorded)[number];

function stubFetch(locations: readonly Location[] = recorded) {
  const urls: URL[] = [];
  const byLat = new Map(
    locations.map((l, i) => [String(recorded[i].latitude.toFixed(1)), l]),
  );
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    urls.push(url);
    const body = url.searchParams
      .get("latitude")!
      .split(",")
      .map((lat) => byLat.get(lat));
    return Response.json(body.length === 1 ? body[0] : body);
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
  clock = new FakeClock(NOW);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openMeteo samples", () => {
  it("maps the recorded response to samples in mph, °F, mm per hour and a snow flag", async () => {
    const { fetch, urls } = stubFetch();
    const weather = openMeteo({ baseUrl: BASE, fetch })(db, clock);

    const samples = await weather.samples([
      { ...MANHATTAN, atMs: NOW },
      { ...PHILADELPHIA, atMs: NOW },
      { ...MANHATTAN, atMs: IN_3H },
    ]);

    expect(urls).toHaveLength(1);
    expect(urls[0].origin + urls[0].pathname).toBe(`${BASE}/v1/forecast`);
    const variables =
      "temperature_2m,precipitation,snowfall,wind_speed_10m,wind_direction_10m";
    expect(Object.fromEntries(urls[0].searchParams)).toEqual({
      latitude: "40.7,39.9",
      longitude: "-74.0,-75.2",
      current: variables,
      hourly: variables,
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      precipitation_unit: "mm",
      forecast_days: "2",
      timezone: "UTC",
      timeformat: "unixtime",
    });
    expect(samples).toEqual([
      { windMph: 4.8, windFromDeg: 312, tempF: 65, precipMmH: 0, snow: false },
      { windMph: 5, windFromDeg: 353, tempF: 64.9, precipMmH: 0, snow: false },
      {
        windMph: 6.8,
        windFromDeg: 294,
        tempF: 69.2,
        precipMmH: 0,
        snow: false,
      },
    ]);
  });

  it("scales current precipitation to an hourly rate and flags any snowfall", async () => {
    const wet = structuredClone(recorded[0]);
    wet.current.precipitation = 0.5;
    const at = wet.hourly.time.indexOf(IN_3H / 1000);
    wet.hourly.precipitation[at] = 1.2;
    wet.hourly.snowfall[at] = 0.7;
    const { fetch } = stubFetch([wet]);
    const weather = openMeteo({ baseUrl: BASE, fetch })(db, clock);

    const [now, later] = await weather.samples([
      { ...MANHATTAN, atMs: NOW },
      { ...MANHATTAN, atMs: IN_3H },
    ]);

    expect(now).toMatchObject({ precipMmH: 2, snow: false });
    expect(later).toMatchObject({ precipMmH: 1.2, snow: true });
  });

  it("rejects when the service answers with an error status", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ error: true, reason: "bad" }, { status: 400 }),
    ) as unknown as typeof globalThis.fetch;
    const weather = openMeteo({ baseUrl: BASE, fetch })(db, clock);

    await expect(
      weather.samples([{ ...MANHATTAN, atMs: NOW }]),
    ).rejects.toThrow("400");
  });

  it("rejects an hour outside the forecast window", async () => {
    const { fetch } = stubFetch();
    const weather = openMeteo({ baseUrl: BASE, fetch })(db, clock);

    await expect(
      weather.samples([{ ...MANHATTAN, atMs: NOW + 72 * HOUR }]),
    ).rejects.toThrow();
  });
});

describe("weather_cache", () => {
  it("serves a repeat within 10 minutes without a request", async () => {
    const { fetch, urls } = stubFetch();
    const weather = openMeteo({ baseUrl: BASE, fetch })(db, clock);
    const query = [
      { ...MANHATTAN, atMs: NOW },
      { ...PHILADELPHIA, atMs: IN_3H },
    ];

    const first = await weather.samples(query);
    clock.advance(9 * MINUTE);
    const second = await weather.samples(query);

    expect(urls).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("asks again once the cached sample is older than 10 minutes", async () => {
    const { fetch, urls } = stubFetch();
    const weather = openMeteo({ baseUrl: BASE, fetch })(db, clock);
    const query = [{ ...MANHATTAN, atMs: IN_3H }];

    await weather.samples(query);
    clock.advance(11 * MINUTE);
    await weather.samples(query);

    expect(urls).toHaveLength(2);
  });

  it("shares the cache across adapter instances on the same database", async () => {
    const { fetch, urls } = stubFetch();
    const query = [{ ...MANHATTAN, atMs: NOW }];

    await openMeteo({ baseUrl: BASE, fetch })(db, clock).samples(query);
    await openMeteo({ baseUrl: BASE, fetch })(db, clock).samples(query);

    expect(urls).toHaveLength(1);
  });

  it("requests only the cells it has not cached, by 0.1° cell", async () => {
    const { fetch, urls } = stubFetch();
    const weather = openMeteo({ baseUrl: BASE, fetch })(db, clock);

    await weather.samples([{ ...MANHATTAN, atMs: NOW }]);
    const samples = await weather.samples([
      { lat: 40.68, lon: -74.03, atMs: NOW },
      { ...PHILADELPHIA, atMs: NOW },
    ]);

    expect(urls).toHaveLength(2);
    expect(urls[1].searchParams.get("latitude")).toBe("39.9");
    expect(urls[1].searchParams.get("longitude")).toBe("-75.2");
    expect(samples.map((s) => s.tempF)).toEqual([65, 64.9]);
  });
});
