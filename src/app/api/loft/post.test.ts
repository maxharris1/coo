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
