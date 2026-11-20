import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import type { FakeJar } from "@/test/fakes/jar";
import { geoClient } from "@/test/geoRoute";
import { loftPost } from "../post";
import { loftTravelPost } from "./post";

const HOUR = 3_600_000;
const NOT_FOUND = "Could not find that place. Try a neighborhood or a city.";
const PARK_SLOPE = {
  suburb: "Park Slope",
  state: "New York",
  stateCode: "NY",
  country: "United States",
  countryCode: "US",
};
const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};
const BACK_BAY = { lat: 42.3503, lon: -71.081 };
const FISHTOWN = { lat: 39.9713, lon: -75.1338 };
const HOME_LOFT = {
  lat: 40.714,
  lon: -73.9625,
  label: "Williamsburg",
  city: "New York, NY",
  travelling: false,
};
const BACK_BAY_LOFT = {
  lat: 42.35,
  lon: -71.08,
  label: "Back Bay",
  city: "Boston, MA",
  travelling: true,
};

let deps: TestDeps;
let loft: ReturnType<typeof geoClient>;
let travel: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  loft = geoClient(deps, loftPost, "/api/loft");
  travel = geoClient(deps, loftTravelPost, "/api/loft/travel");
});

async function onboarded(number: string, name: string) {
  const session = await loft.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  const set = await loft.post({ lat: 40.71427, lon: -73.96143 }, session.jar);
  if (set.status !== 200) throw new Error("test loft setup failed");
  return session;
}

async function profile(id: string): Promise<Profile> {
  const [row] = await deps.db.query<Profile>(
    "select * from profiles where id = $1",
    [id],
  );
  return row;
}

const travelOf = async (id: string) => {
  const p = await profile(id);
  return {
    on: p.travel_on,
    lat: p.travel_lat,
    lon: p.travel_lon,
    label: p.travel_label,
    city: p.travel_city,
    cityLat: p.travel_city_lat,
    cityLon: p.travel_city_lon,
    changedAt: p.travel_changed_at?.getTime() ?? null,
  };
};

const turnOn = (jar: FakeJar, at = BACK_BAY) =>
  travel.post({ on: true, ...at }, jar);
const turnOff = (jar: FakeJar) => travel.post({ on: false }, jar);

describe("POST /api/loft/travel", () => {
  it("refuses a request without a session", async () => {
    const { status, json } = await travel.post({ on: false });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a caller who has not set a loft", async () => {
    const { id, jar } = await loft.signIn("(555) 123-4567");
    await onboard(deps, id as UserId, { ...SETUP, name: "Max" });
    const { status, json } = await turnOn(jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });

  it.each([
    [{}],
    [{ on: true }],
    [{ on: "yes" }],
    [{ on: true, lat: 91, lon: 0 }],
  ])("answers %j with 400 invalid", async (body) => {
    const { jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await travel.post(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("turns travel on at the snapped point with its neighbourhood and city centre", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await turnOn(jar);
    expect(status).toBe(200);
    expect(json.loft).toEqual(BACK_BAY_LOFT);
    expect(await travelOf(id)).toEqual({
      on: true,
      lat: 42.35,
      lon: -71.08,
      label: "Back Bay",
      city: "Boston, MA",
      cityLat: 42.3601,
      cityLon: -71.0589,
      changedAt: deps.clock.now(),
    });
  });

  it("refuses a second change inside 12 hours and accepts one at 12 hours (ac-2)", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    expect((await turnOn(jar)).status).toBe(200);
    const after = await travelOf(id);

    deps.clock.advance(12 * HOUR - 1);
    const early = await turnOff(jar);
    expect(early.status).toBe(409);
    expect(early.json.error.code).toBe("conflict");
    expect(early.json.error.message).toMatch(/12 hours/);
    expect(await travelOf(id)).toEqual(after);

    deps.clock.advance(1);
    const late = await turnOff(jar);
    expect(late.status).toBe(200);
    expect(late.json.loft).toEqual(HOME_LOFT);
    expect(await travelOf(id)).toMatchObject({
      on: false,
      changedAt: deps.clock.now(),
    });
  });

  it("counts moving the travel loft as a change", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    await turnOn(jar);
    deps.clock.advance(HOUR);
    const moved = await turnOn(jar, FISHTOWN);
    expect(moved.status).toBe(409);
    expect((await travelOf(id)).label).toBe("Back Bay");
  });

  it("answers a repeat of the current state as a 200 no-op", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const off = await turnOff(jar);
    expect(off.status).toBe(200);
    expect(off.json.loft).toEqual(HOME_LOFT);
    expect((await travelOf(id)).changedAt).toBeNull();

    await turnOn(jar);
    const changedAt = deps.clock.now();
    deps.clock.advance(HOUR);
    const again = await turnOn(jar);
    expect(again.status).toBe(200);
    expect(again.json.loft).toEqual(BACK_BAY_LOFT);
    expect((await travelOf(id)).changedAt).toBe(changedAt);
  });

  it("refuses a point the geocoder cannot name and changes nothing", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await turnOn(jar, { lat: 0, lon: 0 });
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await travelOf(id)).toMatchObject({ on: false, changedAt: null });
  });

  it("refuses a point the geocoder names without a city, keeping the loft and the cooldown", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    vi.spyOn(deps.geocoder, "reverse").mockResolvedValueOnce(PARK_SLOPE);
    const before = await travelOf(id);
    const { status, json } = await turnOn(jar, {
      lat: 40.67127,
      lon: -73.98143,
    });
    expect(status).toBe(400);
    expect(json.error).toEqual({ code: "invalid", message: NOT_FOUND });
    expect(await travelOf(id)).toEqual(before);
    const next = await turnOn(jar);
    expect(next.status).toBe(200);
    expect(next.json.loft).toEqual(BACK_BAY_LOFT);
  });

  it("changes only the caller's switch, and another user's change does not hold mine", async () => {
    const other = await onboarded("(555) 765-4321", "Ana");
    const me = await onboarded("(555) 123-4567", "Max");
    const before = await travelOf(other.id);

    const mine = await travel.post(
      { on: true, ...BACK_BAY, id: other.id, userId: other.id },
      me.jar,
    );
    expect(mine.status).toBe(200);
    expect(await travelOf(other.id)).toEqual(before);

    expect((await turnOn(other.jar, FISHTOWN)).status).toBe(200);
    expect((await travelOf(me.id)).label).toBe("Back Bay");
  });
});
