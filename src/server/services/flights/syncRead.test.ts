import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { HOUR_MS, insertFlyingDelivery } from "@/test/fixtures/flights";
import { seedWorld, type World } from "@/test/seedWorld";
import { syncFlights } from "./syncRead";

let deps: TestDeps;
let world: World;
let flightId: string;
let noteId: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  ({ flightId, noteId } = await insertFlyingDelivery(
    deps.db,
    world,
    deps.clock.now(),
  ));
});

async function land(id: string, landedMs: number) {
  await deps.db.query(
    "update flights set status = 'landed', landed_at = $2 where id = $1",
    [id, new Date(landedMs).toISOString()],
  );
}

describe("syncFlights", () => {
  it("gives the owner the flying flight as mine", async () => {
    const flights = await syncFlights(deps, world.max.id);
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      id: flightId,
      status: "flying",
      role: "mine",
      hasNote: true,
      owner: { id: world.max.id },
      counterpart: { id: world.priya.id },
      arriveAt: deps.clock.now() + HOUR_MS,
    });
  });

  it("gives the counterpart the flying flight as incoming", async () => {
    const flights = await syncFlights(deps, world.priya.id);
    expect(flights.map((f) => [f.id, f.role])).toEqual([
      [flightId, "incoming"],
    ]);
  });

  it("gives a stranger nothing", async () => {
    expect(await syncFlights(deps, world.rosa.id)).toEqual([]);
  });

  it("never carries the note body", async () => {
    const [{ body }] = await deps.db.query<{ body: string }>(
      "select body from notes where id = $1",
      [noteId],
    );
    const json = JSON.stringify(await syncFlights(deps, world.priya.id));
    expect(json).not.toContain(body);
    expect(json).not.toContain(noteId);
  });

  it("keeps a flight landed in the last 24 hours and drops an older one", async () => {
    await land(flightId, deps.clock.now() - 23 * HOUR_MS);
    expect((await syncFlights(deps, world.max.id)).map((f) => f.id)).toEqual([
      flightId,
    ]);

    await land(flightId, deps.clock.now() - 25 * HOUR_MS);
    expect(await syncFlights(deps, world.max.id)).toEqual([]);
  });

  it("drops a cancelled flight", async () => {
    await deps.db.query(
      "update flights set status = 'cancelled' where id = $1",
      [flightId],
    );
    expect(await syncFlights(deps, world.max.id)).toEqual([]);
  });

  it("strips the bird's care numbers from the stored input", async () => {
    await deps.db.query("update flights set input = $2 where id = $1", [
      flightId,
      {
        flightId,
        bird: { speedMph: 40, belly: 50, feathers: 60, energy: 70, level: 1 },
      },
    ]);
    const [flight] = await syncFlights(deps, world.priya.id);
    expect(flight.input?.bird).toEqual({ speedMph: 40, level: 1 });
  });
});
