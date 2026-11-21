import { afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { visitReleasePost } from "@/app/api/visits/[id]/release/post";
import { toE164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { log } from "@/server/log";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "./deps";
import { FakeJar } from "./fakes/jar";
import { insertPlannedDelivery } from "./fixtures/plannedFlight";
import { seedWorld } from "./seedWorld";

type Mode = "timeout" | "release";

afterEach(() => {
  vi.restoreAllMocks();
});

async function release(deps: TestDeps, visitId: string) {
  const jar = new FakeJar();
  const phone = toE164("+15550000002");
  if (!phone) throw new Error("invalid fixture");
  await deps.auth(jar).verifyCode(phone, "000000");
  const cookie = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const response = await visitReleasePost(createJsonRoute(async () => deps))(
    new NextRequest(`https://coo.test/api/visits/${visitId}/release`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: "{}",
    }),
    { params: Promise.resolve({ id: visitId }) },
  );
  expect(response.status).toBe(200);
}

async function travellingWithoutCityCentre(mode: Mode, homeCentre: boolean) {
  const deps = await makeTestDeps();
  const world = await seedWorld(deps.db, deps.clock.now());
  const delivery = await insertPlannedDelivery(
    deps.db,
    world,
    deps.clock.now(),
  );
  deps.clock.set(delivery.arriveAtMs);
  await tick(deps);
  await deps.db.query(
    "update friendships set a_shows = 'city' where a_id = $1 and b_id = $2",
    [world.max.id, world.priya.id],
  );
  await deps.db.query(
    `update profiles
     set travel_on = true, travel_lat = 42.35, travel_lon = -71.08,
         travel_label = 'Back Bay', travel_city = 'Boston, MA',
         travel_city_lat = null, travel_city_lon = null
     where id = $1`,
    [world.max.id],
  );
  if (!homeCentre) {
    await deps.db.query(
      "update profiles set home_city_lat = null, home_city_lon = null where id = $1",
      [world.max.id],
    );
  }
  const [{ id: visitId }] = await deps.db.query<{ id: string }>(
    "select id from visits where flight_id = $1",
    [delivery.flightId],
  );
  if (mode === "timeout") deps.clock.advance(30 * 60_000);
  else await release(deps, visitId);

  const warn = vi.spyOn(log, "warn");
  const first = await tick(deps);
  const second = await tick(deps);
  const returns = await deps.db.query<{
    to_lat: number;
    to_lon: number;
    to_label: string;
  }>(
    "select to_lat, to_lon, to_label from flights where kind = 'return' and bird_id = $1",
    [delivery.birdId],
  );
  const [state] = await deps.db.query(
    `select v.status as visit_status, v.return_flight_id, b.status as bird_status
     from visits v join birds b on b.id = v.bird_id where v.id = $1`,
    [visitId],
  );
  return {
    visitId,
    birdId: delivery.birdId,
    first,
    second,
    returns,
    state,
    warn,
  };
}

test.each<Mode>(["timeout", "release"])(
  "a travel loft with no city centre returns the bird to the home city centre (%s)",
  async (mode) => {
    const { first, second, returns, state } = await travellingWithoutCityCentre(
      mode,
      true,
    );
    expect(first.counts.endVisits).toBe(1);
    expect(second.counts.endVisits).toBe(0);
    expect(returns).toEqual([
      { to_lat: 40.712, to_lon: -74.005, to_label: "New York" },
    ]);
    expect(state).toMatchObject({
      visit_status: "left",
      bird_status: "flying",
    });
  },
);

test.each<Mode>(["timeout", "release"])(
  "with no city centre anywhere the visit ends and the bird is home without a flight (%s)",
  async (mode) => {
    const { visitId, birdId, first, second, returns, state, warn } =
      await travellingWithoutCityCentre(mode, false);
    expect(first.counts.endVisits).toBe(1);
    expect(second.counts.endVisits).toBe(0);
    expect(returns).toEqual([]);
    expect(state).toEqual({
      visit_status: "left",
      return_flight_id: null,
      bird_status: "home",
    });
    expect(
      warn.mock.calls.filter(
        ([event]) => event === "endVisits.noReturnEndpoint",
      ),
    ).toEqual([["endVisits.noReturnEndpoint", { visitId, birdId }]]);
  },
);
