import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { log } from "@/server/log";
import type { UserId } from "@/server/ports/auth";
import type { Profile } from "@/server/auth";
import { onboard } from "@/server/services/onboarding";
import { searchPlaces } from "@/server/services/places";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { loftPost } from "./post";

const NOT_FOUND = "Could not find that place. Try a neighborhood or a city.";
const PARK_SLOPE = {
  suburb: "Park Slope",
  state: "New York",
  stateCode: "NY",
  country: "United States",
  countryCode: "US",
};
const LA_SOURCE = {
  suburb: "La Source",
  city: "Saint-Denis",
  state: "Réunion",
  country: "France",
  countryCode: "FR",
};
const saintDenis = (lat: number, lon: number, region: string) => ({
  label: "Saint-Denis",
  sublabel: `${region}, France`,
  kind: "city" as const,
  lat,
  lon,
  city: "Saint-Denis",
  region,
  country: "France",
  countryCode: "FR",
});
const MAINLAND_SAINT_DENIS = saintDenis(48.936, 2.3575, "Île-de-France");
const REUNION_SAINT_DENIS = saintDenis(-20.8823, 55.4504, "Réunion");
const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, loftPost, "/api/loft");
});

async function withProfile(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  return session;
}

async function profile(id: string): Promise<Profile> {
  const [row] = await deps.db.query<Profile>(
    "select * from profiles where id = $1",
    [id],
  );
  return row;
}

const homeOf = async (id: string) => {
  const p = await profile(id);
  return {
    lat: p.home_lat,
    lon: p.home_lon,
    label: p.home_label,
    city: p.home_city,
    cityLat: p.home_city_lat,
    cityLon: p.home_city_lon,
  };
};

function recordingDb(inner: Db, calls: unknown[]): Db {
  return {
    query(sql, params) {
      calls.push([sql, params]);
      return inner.query(sql, params);
    },
    tx: (fn) => inner.tx((db) => fn(recordingDb(db, calls))),
  };
}

describe("POST /api/loft", () => {
  it("refuses a request without a session", async () => {
    const { status, json } = await client.post({ lat: 40.7, lon: -73.9 });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a signed-in caller who has no profile yet", async () => {
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.post({ lat: 40.7, lon: -73.9 }, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });

  it.each([
    [{}],
    [{ lat: 91, lon: 0 }],
    [{ lat: 0, lon: -181 }],
    [{ lat: "40.7", lon: "-73.9" }],
    [{ placeId: 7 }],
    [{ lat: 40.7, lon: -73.9, centre: "yes" }],
  ])("answers %j with 400 invalid", async (body) => {
    const { jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.post(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("stores only the snapped roost, its neighbourhood and the city centre (ac-1)", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const dbCalls: unknown[] = [];
    deps.db = recordingDb(deps.db, dbCalls);
    const reverse = vi.spyOn(deps.geocoder, "reverse");
    const search = vi.spyOn(deps.geocoder, "search");
    const logs = [
      vi.spyOn(log, "info"),
      vi.spyOn(log, "warn"),
      vi.spyOn(log, "error"),
    ];

    const { status, json } = await client.post(
      { lat: 40.71427, lon: -73.96143 },
      jar,
    );

    expect(status).toBe(200);
    expect(json.loft).toEqual({
      lat: 40.714,
      lon: -73.9625,
      label: "Williamsburg",
      city: "New York, NY",
      travelling: false,
    });
    expect(await homeOf(id)).toEqual({
      lat: 40.714,
      lon: -73.9625,
      label: "Williamsburg",
      city: "New York, NY",
      cityLat: 40.7128,
      cityLon: -74.006,
    });
    expect((await profile(id)).onboarded_at?.getTime()).toBe(deps.clock.now());

    const seen = JSON.stringify([
      dbCalls,
      reverse.mock.calls,
      search.mock.calls,
      ...logs.map((spy) => spy.mock.calls),
    ]);
    expect(seen).toMatch(/40\.714\b/);
    expect(seen).not.toMatch(/71427|96143/);
  });

  it("stores the held roost of a place chosen from search", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const { results } = await searchPlaces(deps, id as UserId, "Fishtown");
    const { status, json } = await client.post(
      { placeId: results[0].placeId },
      jar,
    );
    expect(status).toBe(200);
    expect(json.loft).toMatchObject({ label: "Fishtown" });
    expect(await homeOf(id)).toEqual({
      lat: 39.972,
      lon: -75.135,
      label: "Fishtown",
      city: "Philadelphia, PA",
      cityLat: 39.9526,
      cityLon: -75.1652,
    });
  });

  it("stores the selected town's centre as the roost, not a same-named town's", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    vi.spyOn(deps.geocoder, "reverse").mockResolvedValue(LA_SOURCE);
    vi.spyOn(deps.geocoder, "search").mockImplementation(async (q) =>
      q === "Saint-Denis, Réunion, France"
        ? [REUNION_SAINT_DENIS, MAINLAND_SAINT_DENIS]
        : [MAINLAND_SAINT_DENIS, REUNION_SAINT_DENIS],
    );
    const { status, json } = await client.post(
      { lat: -20.9013, lon: 55.4791, centre: true },
      jar,
    );
    expect(status).toBe(200);
    expect(json.loft).toEqual({
      lat: -20.8823,
      lon: 55.4504,
      label: "Saint-Denis",
      city: "Saint-Denis, France",
      travelling: false,
    });
    expect(await homeOf(id)).toEqual({
      lat: -20.8823,
      lon: 55.4504,
      label: "Saint-Denis",
      city: "Saint-Denis, France",
      cityLat: -20.8823,
      cityLon: 55.4504,
    });
  });

  it("stores the chosen Réunion town's centre when the reverse geocode leaves out the state", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    vi.spyOn(deps.geocoder, "reverse").mockResolvedValue({
      suburb: "La Source",
      city: "Saint-Denis",
      country: "France",
      countryCode: "FR",
    });
    vi.spyOn(deps.geocoder, "search").mockImplementation(async (q) =>
      q === "Saint-Denis, Réunion, France"
        ? [REUNION_SAINT_DENIS, MAINLAND_SAINT_DENIS]
        : [MAINLAND_SAINT_DENIS, REUNION_SAINT_DENIS],
    );
    const { results } = await searchPlaces(
      deps,
      id as UserId,
      "Saint-Denis, Réunion",
    );
    const reunion = results.find((r) => r.sublabel === "Réunion, France")!;
    const { status, json } = await client.post(
      { placeId: reunion.placeId, centre: true },
      jar,
    );
    expect(status).toBe(200);
    expect(json.loft).toMatchObject({ lat: -20.8823, lon: 55.4504 });
    expect(await homeOf(id)).toEqual({
      lat: -20.8823,
      lon: 55.4504,
      label: "Saint-Denis",
      city: "Saint-Denis, France",
      cityLat: -20.8823,
      cityLon: 55.4504,
    });
  });

  it("keeps the reverse geocode's state when the chosen Réunion town has none", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const stateless = { ...REUNION_SAINT_DENIS, region: undefined };
    vi.spyOn(deps.geocoder, "reverse").mockResolvedValue(LA_SOURCE);
    vi.spyOn(deps.geocoder, "search").mockImplementation(async (q) =>
      q === "Saint-Denis, Réunion, France"
        ? [REUNION_SAINT_DENIS, MAINLAND_SAINT_DENIS]
        : q === "Saint-Denis, France"
          ? [MAINLAND_SAINT_DENIS, REUNION_SAINT_DENIS]
          : [stateless],
    );
    const { results } = await searchPlaces(deps, id as UserId, "Saint-Denis");
    const { status, json } = await client.post(
      { placeId: results[0].placeId, centre: true },
      jar,
    );
    expect(status).toBe(200);
    expect(json.loft).toMatchObject({ lat: -20.8823, lon: 55.4504 });
    expect(await homeOf(id)).toMatchObject({
      lat: -20.8823,
      lon: 55.4504,
      cityLat: -20.8823,
      cityLon: 55.4504,
    });
  });

  it("stores the saved place's town centre after its search hold expires", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const { results } = await searchPlaces(deps, id as UserId, "Fishtown");
    const { placeId } = results[0];
    expect((await client.post({ placeId }, jar)).status).toBe(200);
    deps.clock.advance(10 * 60_000 + 1);
    const { status, json } = await client.post({ placeId, centre: true }, jar);
    expect(status).toBe(200);
    expect(json.loft).toMatchObject({ lat: 39.9526, lon: -75.1652 });
    expect(await homeOf(id)).toMatchObject({
      lat: 39.9526,
      lon: -75.1652,
      label: "Philadelphia",
    });
  });

  it("refuses someone else's saved place after its search hold expires", async () => {
    const owner = await withProfile("(555) 123-4567", "Max");
    const { results } = await searchPlaces(
      deps,
      owner.id as UserId,
      "Fishtown",
    );
    const { placeId } = results[0];
    expect((await client.post({ placeId }, owner.jar)).status).toBe(200);
    deps.clock.advance(10 * 60_000 + 1);
    const other = await withProfile("(555) 765-4321", "Ana");
    const { status } = await client.post({ placeId, centre: true }, other.jar);
    expect(status).toBe(400);
    expect((await profile(other.id)).home_lat).toBeNull();
  });

  it("refuses a search result that was never saved once its hold expires", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const { results } = await searchPlaces(deps, id as UserId, "Fishtown");
    deps.clock.advance(10 * 60_000 + 1);
    const { status } = await client.post(
      { placeId: results[0].placeId, centre: true },
      jar,
    );
    expect(status).toBe(400);
  });

  it("stores the town centre of a place chosen from search", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const { results } = await searchPlaces(deps, id as UserId, "Fishtown");
    const { status } = await client.post(
      { placeId: results[0].placeId, centre: true },
      jar,
    );
    expect(status).toBe(200);
    expect(await homeOf(id)).toEqual({
      lat: 39.9526,
      lon: -75.1652,
      label: "Philadelphia",
      city: "Philadelphia, PA",
      cityLat: 39.9526,
      cityLon: -75.1652,
    });
  });

  it("refuses the town centre when the city has no centre and stores nothing", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    vi.spyOn(deps.geocoder, "search").mockResolvedValue([]);
    const { status, json } = await client.post(
      { lat: 40.71427, lon: -73.96143, centre: true },
      jar,
    );
    expect(status).toBe(400);
    expect(json.error).toEqual({ code: "invalid", message: NOT_FOUND });
    expect((await profile(id)).home_lat).toBeNull();
    expect((await profile(id)).onboarded_at).toBeNull();
  });

  it("refuses an unknown placeId as 400 invalid and stores nothing", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.post(
      { placeId: "33333333-3333-4333-8333-333333333333" },
      jar,
    );
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect((await profile(id)).home_lat).toBeNull();
    expect((await profile(id)).onboarded_at).toBeNull();
  });

  it("refuses a point the geocoder cannot name as 400 invalid and stores nothing", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.post({ lat: 0, lon: 0 }, jar);
    expect(status).toBe(400);
    expect(json.error).toEqual({ code: "invalid", message: NOT_FOUND });
    expect((await profile(id)).onboarded_at).toBeNull();
  });

  it("refuses a point the geocoder names without a city and stores nothing", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    vi.spyOn(deps.geocoder, "reverse").mockResolvedValueOnce(PARK_SLOPE);
    const { status, json } = await client.post(
      { lat: 40.67127, lon: -73.98143 },
      jar,
    );
    expect(status).toBe(400);
    expect(json.error).toEqual({ code: "invalid", message: NOT_FOUND });
    expect((await profile(id)).home_lat).toBeNull();
    expect((await profile(id)).onboarded_at).toBeNull();
  });

  it("keeps a usable home loft when a move lands on a point without a city", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const set = await client.post({ lat: 40.71427, lon: -73.96143 }, jar);
    const before = await homeOf(id);
    vi.spyOn(deps.geocoder, "reverse").mockResolvedValueOnce(PARK_SLOPE);
    const moved = await client.post({ lat: 40.67127, lon: -73.98143 }, jar);
    expect(moved.status).toBe(400);
    expect(await homeOf(id)).toEqual(before);
    expect(set.json.loft).not.toBeNull();
  });

  it("refuses a held place whose point has no city and stores nothing", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const { results } = await searchPlaces(deps, id as UserId, "Fishtown");
    vi.spyOn(deps.geocoder, "reverse").mockResolvedValueOnce(PARK_SLOPE);
    const { status, json } = await client.post(
      { placeId: results[0].placeId },
      jar,
    );
    expect(status).toBe(400);
    expect(json.error).toEqual({ code: "invalid", message: NOT_FOUND });
    expect((await profile(id)).home_lat).toBeNull();
    expect((await profile(id)).onboarded_at).toBeNull();
  });

  it("keeps the city without a centre when the city search fails", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    vi.spyOn(deps.geocoder, "search").mockRejectedValue(new Error("down"));
    const { status } = await client.post(
      { lat: 40.71427, lon: -73.96143 },
      jar,
    );
    expect(status).toBe(200);
    expect(await homeOf(id)).toMatchObject({
      city: "New York, NY",
      cityLat: null,
      cityLon: null,
    });
  });

  it("converges when posted twice, keeping the first onboarded time", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const body = { lat: 40.71427, lon: -73.96143 };
    const first = await client.post(body, jar);
    const onboardedAt = deps.clock.now();
    const before = await homeOf(id);
    deps.clock.advance(60_000);
    const second = await client.post(body, jar);
    expect(second.status).toBe(200);
    expect(second.json.loft).toEqual(first.json.loft);
    expect(await homeOf(id)).toEqual(before);
    expect((await profile(id)).onboarded_at?.getTime()).toBe(onboardedAt);
  });

  it("moves only the caller's loft even when the body names someone else", async () => {
    const other = await withProfile("(555) 765-4321", "Ana");
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const { status } = await client.post(
      { lat: 40.71427, lon: -73.96143, id: other.id, userId: other.id },
      jar,
    );
    expect(status).toBe(200);
    expect((await homeOf(id)).label).toBe("Williamsburg");
    expect((await profile(other.id)).home_lat).toBeNull();
    expect((await profile(other.id)).onboarded_at).toBeNull();
  });
});
