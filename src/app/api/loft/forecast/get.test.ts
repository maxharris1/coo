import { beforeEach, describe, expect, it } from "vitest";
import type { WeatherSample } from "@/lib/flight/engine";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { loftForecastGet } from "./get";

const MAX_PHONE = "+15550000001";
const PRIYA_PHONE = "+15550000002";
const CLEAR: WeatherSample = {
  windMph: 0,
  windFromDeg: 0,
  tempF: 55,
  precipMmH: 0,
  snow: false,
};
const TOMORROW_8_12_16_EST = [13, 17, 21].map((h) => Date.UTC(2026, 10, 20, h));

let deps: TestDeps;
let world: World;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  client = geoClient(deps, loftForecastGet, "/api/loft/forecast");
});

async function homeOf(id: string) {
  const [row] = await deps.db.query<{ home_lat: number; home_lon: number }>(
    "select home_lat, home_lon from profiles where id = $1",
    [id],
  );
  return { lat: row.home_lat, lon: row.home_lon };
}

async function forecastFor(phone: string, sample?: WeatherSample) {
  if (sample) deps.weather.set(sample);
  const { jar } = await client.signIn(phone);
  return client.get({}, jar);
}

describe("GET /api/loft/forecast", () => {
  it("calls tomorrow at 31 degrees with flurries cold, on Friday", async () => {
    const { status, json } = await forecastFor(MAX_PHONE, {
      ...CLEAR,
      tempF: 31.2,
      snow: true,
    });

    expect(status).toBe(200);
    expect(json.forecast).toEqual({
      day: "Friday",
      tempF: 31,
      kind: "cold",
      snow: true,
      rain: false,
    });
  });

  it("names rain wet, snow above freezing snowy and a clear day none", async () => {
    const rain = await forecastFor(MAX_PHONE, {
      ...CLEAR,
      tempF: 50,
      precipMmH: 2,
    });
    expect(rain.json.forecast).toMatchObject({
      tempF: 50,
      kind: "wet",
      rain: true,
      snow: false,
    });

    const snow = await forecastFor(MAX_PHONE, {
      ...CLEAR,
      tempF: 34,
      snow: true,
    });
    expect(snow.json.forecast).toMatchObject({
      tempF: 34,
      kind: "snowy",
      snow: true,
    });

    const clear = await forecastFor(MAX_PHONE, CLEAR);
    expect(clear.json.forecast).toEqual({
      day: "Friday",
      tempF: 55,
      kind: "none",
      snow: false,
      rain: false,
    });
  });

  it("asks about the caller's own loft at 8, 12 and 4 tomorrow", async () => {
    const priyaHome = await homeOf(world.priya.id);
    const maxHome = await homeOf(world.max.id);

    const { status } = await forecastFor(PRIYA_PHONE, CLEAR);

    expect(status).toBe(200);
    expect(deps.weather.queries).toEqual(
      TOMORROW_8_12_16_EST.map((atMs) => ({ ...priyaHome, atMs })),
    );
    expect(deps.weather.queries).not.toContainEqual(
      expect.objectContaining(maxHome),
    );
  });

  it("returns no coordinates of the loft", async () => {
    const home = await homeOf(world.max.id);

    const { json } = await forecastFor(MAX_PHONE, CLEAR);

    const body = JSON.stringify(json);
    expect(body).not.toMatch(/"(lat|lon|latitude|longitude)"/);
    expect(body).not.toContain(String(home.lat));
    expect(body).not.toContain(String(home.lon));
  });

  it("still answers when the weather service fails", async () => {
    deps.weather.set({ ...CLEAR, tempF: 20, snow: true });
    deps.weather.failNext();

    const { status, json } = await forecastFor(MAX_PHONE);

    expect(status).toBe(200);
    expect(json.forecast).toMatchObject({ day: "Friday", kind: "none" });
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get({}, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });
});
