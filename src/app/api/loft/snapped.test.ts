import { beforeEach, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { getFlight } from "@/server/services/flights/get";
import { send } from "@/server/services/flights/send";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { loftPost } from "./post";
import { loftTravelPost } from "./travel/post";

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

const signInMax = () =>
  geoClient(deps, loftPost, "/api/loft").signIn("(555) 000-0001");

async function stored(id: string) {
  const [row] = await deps.db.query<{
    home_lat: number;
    home_lon: number;
    travel_lat: number | null;
    travel_lon: number | null;
  }>(
    "select home_lat, home_lon, travel_lat, travel_lon from profiles where id = $1",
    [id],
  );
  return row;
}

async function priyaFliesToMax() {
  const priya = world.priya.id as UserId;
  const max = world.max.id as UserId;
  const {
    flights: [flight],
  } = await send(deps, priya, {
    body: "Bagels on Sunday",
    sends: [{ friendId: max, birdId: world.priya.birds[0].id }],
  });
  return {
    friendSees: (await getFlight(deps, priya, flight.id)).to,
    ownerSees: (await getFlight(deps, max, flight.id)).to,
  };
}

it("stores and returns a dragged home roost on the grid, and the owner and a friend both see the grid point", async () => {
  const { jar } = await signInMax();
  const loft = geoClient(deps, loftPost, "/api/loft");

  const { status, json } = await loft.post(
    { lat: 40.71427, lon: -73.96143 },
    jar,
  );

  expect(status).toBe(200);
  expect(json.loft).toMatchObject({ lat: 40.714, lon: -73.9625 });
  expect(await stored(world.max.id)).toMatchObject({
    home_lat: 40.714,
    home_lon: -73.9625,
  });
  const { friendSees, ownerSees } = await priyaFliesToMax();
  expect(friendSees).toMatchObject({ lat: 40.714, lon: -73.9625 });
  expect(ownerSees).toMatchObject({ lat: 40.714, lon: -73.9625 });
});

it("stores and returns a dragged travel roost on the grid, and the owner and a friend both see the grid point", async () => {
  const { jar } = await signInMax();
  const travel = geoClient(deps, loftTravelPost, "/api/loft/travel");

  const { status, json } = await travel.post(
    { on: true, lat: 42.3503, lon: -71.081 },
    jar,
  );

  expect(status).toBe(200);
  expect(json.loft).toMatchObject({ lat: 42.35, lon: -71.08 });
  expect(await stored(world.max.id)).toMatchObject({
    travel_lat: 42.35,
    travel_lon: -71.08,
  });
  const { friendSees, ownerSees } = await priyaFliesToMax();
  expect(friendSees).toMatchObject({ lat: 42.35, lon: -71.08 });
  expect(ownerSees).toMatchObject({ lat: 42.35, lon: -71.08 });
});
