import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { cancelFlight } from "./cancel";
import { send } from "./send";

const HOUR_MS = 60 * 60 * 1000;

let deps: TestDeps;
let world: World;
let max: UserId;
let priya: UserId;
let rosa: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  priya = world.priya.id as UserId;
  rosa = world.rosa.id as UserId;
  gerald = world.max.birds[0].id;
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "resolved";
}

async function snapshot() {
  return {
    birds: await deps.db.query("select id, status from birds order by id"),
    notes: await deps.db.query("select * from notes order by id"),
    flights: await deps.db.query("select * from flights order by id"),
  };
}

async function scheduled(owner = max, friendId = priya, birdId = gerald) {
  const { flights } = await send(deps, owner, {
    body: "Coffee at seven, my treat",
    sends: [{ friendId, birdId }],
    releaseAt: deps.clock.now() + 9 * HOUR_MS,
  });
  return flights[0].id;
}

async function birdStatus(id: string) {
  const [row] = await deps.db.query<{ status: string }>(
    "select status from birds where id = $1",
    [id],
  );
  return row.status;
}

describe("cancelFlight", () => {
  it("sets the flight cancelled, frees the bird to home and deletes the note (ac-1)", async () => {
    const flightId = await scheduled();
    expect(await birdStatus(gerald)).toBe("scheduled");

    const { flight } = await cancelFlight(deps, max, flightId);

    expect(flight).toMatchObject({
      id: flightId,
      status: "cancelled",
      role: "mine",
      hasNote: false,
    });
    expect(await birdStatus(gerald)).toBe("home");
    expect(await deps.db.query("select id from notes")).toEqual([]);
    const [row] = await deps.db.query<{ status: string; note_id: unknown }>(
      "select status, note_id from flights where id = $1",
      [flightId],
    );
    expect(row).toEqual({ status: "cancelled", note_id: null });
  });

  it("lets the freed bird be scheduled again (ac-1)", async () => {
    await cancelFlight(deps, max, await scheduled());
    const again = await scheduled();
    expect(await birdStatus(gerald)).toBe("scheduled");
    expect(again).toEqual(expect.any(String));
  });

  it("answers the counterpart with not_found and changes nothing (ac-2)", async () => {
    const flightId = await scheduled();
    const before = await snapshot();

    expect(await refusal(cancelFlight(deps, priya, flightId))).toBe(
      "not_found",
    );
    expect(await snapshot()).toEqual(before);
  });

  it("answers another user's flight with not_found and changes nothing (ac-2)", async () => {
    const flightId = await scheduled(rosa, max, world.rosa.birds[0].id);
    const before = await snapshot();

    expect(await refusal(cancelFlight(deps, max, flightId))).toBe("not_found");
    expect(await refusal(cancelFlight(deps, priya, flightId))).toBe(
      "not_found",
    );
    expect(await snapshot()).toEqual(before);
  });

  it("answers an unknown or malformed id with not_found (ac-2)", async () => {
    expect(
      await refusal(
        cancelFlight(deps, max, "00000000-0000-4000-8000-000000000000"),
      ),
    ).toBe("not_found");
    expect(await refusal(cancelFlight(deps, max, "not-a-uuid"))).toBe(
      "not_found",
    );
  });

  it("refuses a flight that is not scheduled with conflict and changes nothing (ac-2)", async () => {
    const flightId = await scheduled();
    await deps.db.query("update flights set status = 'flying' where id = $1", [
      flightId,
    ]);
    await deps.db.query("update birds set status = 'flying' where id = $1", [
      gerald,
    ]);
    const before = await snapshot();

    expect(await refusal(cancelFlight(deps, max, flightId))).toBe("conflict");
    expect(await snapshot()).toEqual(before);
  });

  it("changes nothing when cancelled a second time (ac-2)", async () => {
    const flightId = await scheduled();
    await cancelFlight(deps, max, flightId);
    const before = await snapshot();

    expect(await refusal(cancelFlight(deps, max, flightId))).toBe("conflict");
    expect(await snapshot()).toEqual(before);
  });

  it("frees the bird once when two cancels race (ac-2)", async () => {
    const flightId = await scheduled();

    const results = await Promise.allSettled([
      cancelFlight(deps, max, flightId),
      cancelFlight(deps, max, flightId),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await birdStatus(gerald)).toBe("home");
    expect(await deps.db.query("select id from notes")).toEqual([]);
  });
});
