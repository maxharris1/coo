import { expect, test } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps } from "./deps";
import { seedWorld } from "./seedWorld";
import { insertWaitingVisit } from "./fixtures/visits";
import { endVisits } from "@/server/services/tick/endVisits";
import { syncFlights } from "@/server/services/flights/syncRead";
import { setTravel } from "@/server/services/loft";

test.each([false, true])(
  "f-1 city-only return preserves privacy with travel=%s",
  async (travel) => {
    const deps = await makeTestDeps();
    const world = await seedWorld(deps.db, deps.clock.now());
    await insertWaitingVisit(deps.db, world, deps.clock.now());
    await deps.db.query(
      "update friendships set a_shows = 'city' where a_id = $1 and b_id = $2",
      [world.max.id, world.priya.id],
    );
    if (travel) {
      const [{ id }] = await deps.db.query<{ id: UserId }>(
        "select id from profiles where id = $1",
        [world.max.id],
      );
      await setTravel(deps, id, {
        on: true,
        roost: { lat: 42.35, lon: -71.08 },
      });
    }
    deps.clock.advance(30 * 60_000);
    await endVisits({ deps, limit: 50, timeUp: () => false });
    const flights = await syncFlights(deps, world.priya.id);
    const ret = flights.find((f) => f.kind === "return");
    expect(ret?.to).toEqual(
      travel
        ? { lat: 42.3601, lon: -71.0589, label: "Boston, MA" }
        : { lat: 40.712, lon: -74.005, label: "New York" },
    );
  },
);
