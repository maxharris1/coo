import { beforeEach, describe, expect, it } from "vitest";
import vectors from "../../../../reference/flight-engine/vectors.json";
import {
  computeFlightPlan,
  searchParty,
  type FlightInput,
  type FlightPlan,
} from "@/lib/flight/engine";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeClock } from "@/test/fakes/clock";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { sendSearchParty } from "./searchParty";

const MINUTE = 60_000;
const FOUND_ID = "vector-major-15";
const NOT_FOUND_ID = "vector-major-142";

function vectorInput(name: string, flightId?: string): FlightInput {
  const v = vectors.vectors.find((x) => x.name === name);
  if (!v) throw new Error(`vectors.json has no ${name} vector`);
  const input = v.input as FlightInput;
  return flightId ? { ...input, flightId } : input;
}

function delayOf(plan: FlightPlan) {
  const d = plan.segments.find((s) => s.kind === "delay");
  if (!d) throw new Error("plan has no delay segment");
  return d;
}

let deps: TestDeps;
let world: World;
let flightId: string;

async function storeInput(input: FlightInput): Promise<FlightPlan> {
  const plan = computeFlightPlan(input);
  await deps.db.query(
    `update flights set input = $2, plan = $3, arrive_at = $4, delay_kind = $5
     where id = $1`,
    [
      flightId,
      JSON.stringify(input),
      JSON.stringify(plan),
      new Date(plan.arriveAtMs).toISOString(),
      plan.delayKind,
    ],
  );
  return plan;
}

beforeEach(async () => {
  const depart = vectorInput("delay-major").departAtMs;
  deps = await makeTestDeps({ clock: new FakeClock(depart) });
  world = await seedWorld(deps.db, depart);
  ({ flightId } = await insertPlannedDelivery(deps.db, world, depart));
});

async function callerFor(id: string): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [id],
  );
  return { userId: id as UserId, profile };
}

async function snapshot() {
  const seeds = await deps.db.query<{ id: string; seeds: number }>(
    "select id, seeds from profiles order by id",
  );
  const ledger = await deps.db.query(
    "select user_id, delta, reason, ref_id from seed_ledger order by id",
  );
  const [flight] = await deps.db.query<{
    input: FlightInput;
    plan: FlightPlan;
    arrive_at: Date;
    search_party: string | null;
  }>("select input, plan, arrive_at, search_party from flights where id = $1", [
    flightId,
  ]);
  return { seeds, ledger, flight };
}

async function seedsOf(id: string): Promise<number> {
  const [row] = await deps.db.query<{ seeds: number }>(
    "select seeds from profiles where id = $1",
    [id],
  );
  return row.seeds;
}

describe("sendSearchParty", () => {
  it("stores the engine's plan for the input plus the override and moves arrival earlier (ac-3)", async () => {
    const input = vectorInput("delay-major", FOUND_ID);
    const original = await storeInput(input);
    const now = delayOf(original).startMs;
    deps.clock.set(now);
    const owner = world.max.id;
    const seedsBefore = await seedsOf(owner);

    const result = await sendSearchParty(
      deps,
      await callerFor(owner),
      flightId,
    );

    const override = searchParty(FOUND_ID, now);
    expect(override).not.toBeNull();
    const expectedInput = { ...input, delayEndOverrideMs: override };
    const expectedPlan = computeFlightPlan(expectedInput as FlightInput);
    const { flight, ledger } = await snapshot();
    expect(result.outcome).toBe("found");
    expect(result.seeds).toBe(seedsBefore - 20);
    expect(await seedsOf(owner)).toBe(seedsBefore - 20);
    expect(ledger).toContainEqual({
      user_id: owner,
      delta: -20,
      reason: "search_party",
      ref_id: flightId,
    });
    expect(flight.input).toEqual(expectedInput);
    expect(flight.plan).toEqual(expectedPlan);
    expect(flight.arrive_at.getTime()).toBe(expectedPlan.arriveAtMs);
    expect(flight.arrive_at.getTime()).toBeLessThan(original.arriveAtMs);
    expect(flight.search_party).toBe("found");
    expect(result.flight).toMatchObject({
      id: flightId,
      searchParty: "found",
      arriveAt: expectedPlan.arriveAtMs,
      plan: expectedPlan,
    });
  });

  it("charges 20 for a failed search and leaves input, plan and arrival unchanged (ac-2)", async () => {
    const original = await storeInput(vectorInput("delay-major", NOT_FOUND_ID));
    const now = delayOf(original).startMs + MINUTE;
    deps.clock.set(now);
    expect(searchParty(NOT_FOUND_ID, now)).toBeNull();
    const owner = world.max.id;
    const before = await snapshot();
    const seedsBefore = await seedsOf(owner);

    const result = await sendSearchParty(
      deps,
      await callerFor(owner),
      flightId,
    );

    const after = await snapshot();
    expect(result.outcome).toBe("not_found");
    expect(result.flight.searchParty).toBe("not_found");
    expect(await seedsOf(owner)).toBe(seedsBefore - 20);
    expect(after.ledger).toContainEqual({
      user_id: owner,
      delta: -20,
      reason: "search_party",
      ref_id: flightId,
    });
    expect(after.flight).toEqual({
      ...before.flight,
      search_party: "not_found",
    });
  });

  it("nudges both people's apps after a search", async () => {
    const original = await storeInput(vectorInput("delay-major", FOUND_ID));
    deps.clock.set(delayOf(original).startMs);

    await sendSearchParty(deps, await callerFor(world.max.id), flightId);

    const events = await deps.db.query<{ user_id: string }>(
      "select user_id from events order by user_id",
    );
    expect(events.map((e) => e.user_id)).toEqual([
      world.max.id,
      world.priya.id,
    ]);
  });

  it("refuses a second search as conflict and spends nothing more (ac-1)", async () => {
    const original = await storeInput(vectorInput("delay-major", FOUND_ID));
    deps.clock.set(delayOf(original).startMs);
    const owner = await callerFor(world.max.id);
    await sendSearchParty(deps, owner, flightId);
    deps.clock.advance(MINUTE);
    const before = await snapshot();

    await expect(
      sendSearchParty(deps, await callerFor(world.max.id), flightId),
    ).rejects.toMatchObject({ code: "conflict" });

    expect(await snapshot()).toEqual(before);
  });

  describe("refusals spend no seeds and change nothing (ac-1)", () => {
    async function expectRefused(
      code: string,
      who = world.max.id,
      id = flightId,
    ) {
      const before = await snapshot();
      await expect(
        sendSearchParty(deps, await callerFor(who), id),
      ).rejects.toMatchObject({ code });
      expect(await snapshot()).toEqual(before);
    }

    it("refuses a minor delay as conflict", async () => {
      const plan = await storeInput(vectorInput("delay-minor"));
      expect(plan.delayKind).toBe("minor");
      deps.clock.set(delayOf(plan).startMs);
      await expectRefused("conflict");
    });

    it("refuses a flight with no delay as conflict", async () => {
      const plan = await storeInput(vectorInput("calm-short"));
      expect(plan.delayKind).toBe("none");
      deps.clock.set(plan.segments[0].startMs + MINUTE);
      await expectRefused("conflict");
    });

    it("refuses before the major delay starts as conflict", async () => {
      const plan = await storeInput(vectorInput("delay-major", FOUND_ID));
      deps.clock.set(delayOf(plan).startMs - MINUTE);
      await expectRefused("conflict");
    });

    it("refuses after the major delay ends as conflict", async () => {
      const plan = await storeInput(vectorInput("delay-major", FOUND_ID));
      deps.clock.set(delayOf(plan).endMs);
      await expectRefused("conflict");
    });

    it("refuses a landed flight as conflict", async () => {
      const plan = await storeInput(vectorInput("delay-major", FOUND_ID));
      deps.clock.set(delayOf(plan).startMs);
      await deps.db.query(
        "update flights set status = 'landed' where id = $1",
        [flightId],
      );
      await expectRefused("conflict");
    });

    it("refuses an owner with fewer than 20 seeds as insufficient_seeds", async () => {
      const plan = await storeInput(vectorInput("delay-major", FOUND_ID));
      deps.clock.set(delayOf(plan).startMs);
      await deps.db.query("update profiles set seeds = 19 where id = $1", [
        world.max.id,
      ]);
      await expectRefused("insufficient_seeds");
    });

    it.each([
      ["the counterpart", () => world.priya.id],
      ["a stranger", () => world.rosa.id],
    ])("refuses %s as not_found", async (_, who) => {
      const plan = await storeInput(vectorInput("delay-major", FOUND_ID));
      deps.clock.set(delayOf(plan).startMs);
      await expectRefused("not_found", who());
    });

    it("refuses an id that is not a uuid as not_found", async () => {
      await expectRefused("not_found", world.max.id, "not-a-uuid");
    });

    it("refuses an unknown flight id as not_found", async () => {
      await expectRefused(
        "not_found",
        world.max.id,
        "00000000-0000-4000-a000-00000000ffff",
      );
    });
  });
});
