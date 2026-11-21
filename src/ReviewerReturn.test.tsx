import { expect, it } from "vitest";
import { trackerView } from "@/components/Tracker";
import {
  FLIGHT_SELECT,
  type FlightRow,
  toFlight,
} from "@/server/services/flights/shape";
import { tick } from "@/server/services/tick";
import { makeTestDeps } from "@/test/deps";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld } from "@/test/seedWorld";

it("a real return flight heads to its owner, rather than the host it left", async () => {
  const deps = await makeTestDeps();
  const world = await seedWorld(deps.db, deps.clock.now());
  await insertWaitingVisit(deps.db, world, deps.clock.now());
  deps.clock.advance(30 * 60_000);
  await tick(deps);
  const [row] = await deps.db.query<FlightRow>(
    `${FLIGHT_SELECT} where f.kind = 'return'`,
  );
  expect(row).toBeDefined();
  expect(row.place_names).toEqual({});
  const arrive = row.arrive_at?.getTime() ?? row.release_at.getTime();
  const now = (row.release_at.getTime() + arrive) / 2;
  const ownerFlight = toFlight(row, world.max.id);
  const hostFlight = toFlight(row, world.priya.id);
  const bird = ownerFlight.bird.name;

  expect(trackerView(ownerFlight, now, "America/New_York", "mi").headline).toBe(
    `${bird} is on the way to you`,
  );
  expect(trackerView(hostFlight, now, "America/New_York", "mi").headline).toBe(
    `${bird} is on the way to ${world.max.name}`,
  );
});
