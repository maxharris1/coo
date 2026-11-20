import { beforeEach, describe, expect, it } from "vitest";
import { haversineMi } from "@/lib/flight/engine";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { joinByCode, setShows } from "@/server/services/friends";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { friendsGet } from "./get";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

const PRIYA_ROOST = { lat: 39.9625, lon: -75.1975 };
const PRIYA_CENTRE = { lat: 39.9526, lon: -75.1652 };
const PRIYA_TRAVEL_ROOST = { lat: 41.8875, lon: -87.6175 };
const PRIYA_TRAVEL_CENTRE = { lat: 41.8781, lon: -87.6298 };
const MAX_ROOST = { lat: 40.7125, lon: -74.0075 };

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

const client = () => geoClient(deps, friendsGet, "/api/friends");

async function onboarded(number: string, name: string) {
  const session = await client().signIn(number);
  const { me } = await onboard(deps, session.id as UserId, {
    ...SETUP,
    name,
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return { ...session, code: me.inviteCode };
}

async function home(
  id: string,
  roost: { lat: number; lon: number },
  label: string,
  city: string,
  centre: { lat: number; lon: number } | null,
) {
  await deps.db.query(
    `update profiles set home_lat = $2, home_lon = $3, home_label = $4,
       home_city = $5, home_city_lat = $6, home_city_lon = $7 where id = $1`,
    [id, roost.lat, roost.lon, label, city, centre?.lat, centre?.lon],
  );
}

async function friends() {
  const priya = await onboarded("(555) 765-4321", "Priya");
  const max = await onboarded("(555) 123-4567", "Max");
  await home(priya.id, PRIYA_ROOST, "Fairmount", "Philadelphia", PRIYA_CENTRE);
  await home(max.id, MAX_ROOST, "Tribeca", "New York", null);
  await joinByCode(deps, max.id as UserId, priya.code);
  return { priya, max };
}

describe("GET /api/friends", () => {
  it("shows Priya's roost while she shows Max her block", async () => {
    const { priya, max } = await friends();

    const { status, json } = await client().get({}, max.jar);

    expect(status).toBe(200);
    expect(json.friends).toEqual([
      {
        id: priya.id,
        name: "Priya",
        handle: "priya",
        shows: "block",
        theyShow: "block",
        where: "Fairmount",
        distanceMi: expect.closeTo(haversineMi(MAX_ROOST, PRIYA_ROOST), 1),
      },
    ]);
  });

  it("shows Priya's city and the distance to its centre once she sets Max to city", async () => {
    const { priya, max } = await friends();
    await setShows(deps, priya.id as UserId, max.id as UserId, "city");

    const { status, json } = await client().get({}, max.jar);

    expect(status).toBe(200);
    const [friend] = json.friends;
    expect(friend).toMatchObject({
      id: priya.id,
      shows: "block",
      theyShow: "city",
      where: "Philadelphia",
    });
    expect(friend.distanceMi).toBeCloseTo(
      haversineMi(MAX_ROOST, PRIYA_CENTRE),
      1,
    );
    const roostMi = haversineMi(MAX_ROOST, PRIYA_ROOST);
    expect(Math.abs(friend.distanceMi - roostMi)).toBeGreaterThan(0.5);
    const body = JSON.stringify(json);
    expect(body).not.toContain("Fairmount");
    expect(body).not.toContain(String(PRIYA_ROOST.lat));
    expect(body).not.toContain(String(PRIYA_ROOST.lon));
  });

  it("keeps what Max shows Priya apart from what she shows him", async () => {
    const { priya, max } = await friends();
    await setShows(deps, max.id as UserId, priya.id as UserId, "city");

    const { json } = await client().get({}, priya.jar);
    const [friend] = json.friends;

    expect(friend).toMatchObject({
      id: max.id,
      shows: "block",
      theyShow: "city",
      where: "New York",
      distanceMi: null,
    });
    expect(JSON.stringify(json)).not.toContain("Tribeca");
  });

  it("uses Priya's travel loft while her travel switch is on", async () => {
    const { priya, max } = await friends();
    await deps.db.query(
      `update profiles set travel_on = true, travel_lat = $2, travel_lon = $3,
         travel_label = 'Streeterville', travel_city = 'Chicago',
         travel_city_lat = $4, travel_city_lon = $5 where id = $1`,
      [
        priya.id,
        PRIYA_TRAVEL_ROOST.lat,
        PRIYA_TRAVEL_ROOST.lon,
        PRIYA_TRAVEL_CENTRE.lat,
        PRIYA_TRAVEL_CENTRE.lon,
      ],
    );
    await setShows(deps, priya.id as UserId, max.id as UserId, "city");

    const { json } = await client().get({}, max.jar);
    const [friend] = json.friends;

    expect(friend.where).toBe("Chicago");
    expect(friend.distanceMi).toBeCloseTo(
      haversineMi(MAX_ROOST, PRIYA_TRAVEL_CENTRE),
      1,
    );
  });

  it("leaves the distance out while I have no loft", async () => {
    const { priya, max } = await friends();
    await deps.db.query(
      "update profiles set home_lat = null, home_lon = null where id = $1",
      [max.id],
    );

    const { json } = await client().get({}, max.jar);

    expect(json.friends[0]).toMatchObject({
      id: priya.id,
      where: "Fairmount",
      distanceMi: null,
    });
  });

  it("lists only my own accepted friends", async () => {
    const { priya, max } = await friends();
    const brenda = await onboarded("(555) 222-3333", "Brenda");
    const omar = await onboarded("(555) 444-5555", "Omar");
    await joinByCode(deps, omar.id as UserId, brenda.code);
    await joinByCode(deps, brenda.id as UserId, max.code);
    const [a, b] = pair(brenda.id as UserId, max.id as UserId);
    await deps.db.query(
      "update friendships set status = 'blocked', blocked_by = $3 where a_id = $1 and b_id = $2",
      [a, b, brenda.id],
    );

    const mine = await client().get({}, max.jar);
    const hers = await client().get({}, brenda.jar);

    expect(mine.json.friends.map((f: { id: string }) => f.id)).toEqual([
      priya.id,
    ]);
    expect(hers.json.friends.map((f: { id: string }) => f.id)).toEqual([
      omar.id,
    ]);
  });

  it("lists my guest links still waiting, never anyone else's", async () => {
    const { priya, max } = await friends();
    await deps.db.query(
      `insert into guest_links (token_hash, sender_id, recipient_name, dest_lat, dest_lon, dest_label, status)
       values ('h1', $1, 'Nana', 40, -75, 'Cherry Hill', 'active'),
              ('h2', $1, 'Old', 40, -75, 'Camden', 'claimed'),
              ('h3', $2, 'Theirs', 40, -75, 'Trenton', 'active')`,
      [max.id, priya.id],
    );

    const { json } = await client().get({}, max.jar);

    expect(json.guestLinks).toEqual([
      { id: expect.any(String), name: "Nana", where: "Cherry Hill" },
    ]);
    expect(JSON.stringify(json)).not.toContain("h1");
  });

  it("refuses a request without a session as 401", async () => {
    await friends();
    const { status, json } = await client().get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});
