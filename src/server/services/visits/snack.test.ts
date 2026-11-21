import { beforeEach, describe, expect, it } from "vitest";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld, type World } from "@/test/seedWorld";
import { snackVisit } from "./snack";

const MINUTE = 60_000;

let deps: TestDeps;
let world: World;
let visitId: string;
let birdId: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  ({ visitId, birdId } = await insertWaitingVisit(
    deps.db,
    world,
    deps.clock.now(),
  ));
  await deps.db.query("update birds set belly = 30 where id = $1", [birdId]);
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
  const ledger = await deps.db.query<{
    user_id: string;
    delta: number;
    reason: string;
    ref_id: string | null;
  }>("select user_id, delta, reason, ref_id from seed_ledger order by id");
  const [bird] = await deps.db.query<{ belly: number }>(
    "select belly from birds where id = $1",
    [birdId],
  );
  const [visit] = await deps.db.query<{ snack_given: boolean }>(
    "select snack_given from visits where id = $1",
    [visitId],
  );
  return { seeds, ledger, belly: bird.belly, snackGiven: visit.snack_given };
}

async function seedsOf(id: string): Promise<number> {
  const [row] = await deps.db.query<{ seeds: number }>(
    "select seeds from profiles where id = $1",
    [id],
  );
  return row.seeds;
}

describe("snackVisit", () => {
  it("costs the host 5, raises belly by 40, tips the owner 5 (ac-2)", async () => {
    const host = world.priya.id;
    const owner = world.max.id;
    const before = { host: await seedsOf(host), owner: await seedsOf(owner) };

    const result = await snackVisit(deps, await callerFor(host), visitId);

    expect(result).toEqual({ seeds: before.host - 5 });
    expect(await seedsOf(host)).toBe(before.host - 5);
    expect(await seedsOf(owner)).toBe(before.owner + 5);
    const after = await snapshot();
    expect(after.belly).toBe(70);
    expect(after.snackGiven).toBe(true);
    expect(after.ledger.filter((r) => r.ref_id === visitId)).toEqual([
      { user_id: host, delta: -5, reason: "snack", ref_id: visitId },
      { user_id: owner, delta: 5, reason: "tip", ref_id: visitId },
    ]);
  });

  it("projects care to now before adding the snack and clamps at full (ac-2)", async () => {
    await deps.db.query("update birds set belly = 90 where id = $1", [birdId]);
    deps.clock.advance(10 * MINUTE);

    await snackVisit(deps, await callerFor(world.priya.id), visitId);

    expect((await snapshot()).belly).toBe(100);
  });

  it("works once: a second snack is conflict and moves no seeds (ac-2)", async () => {
    const host = await callerFor(world.priya.id);
    await snackVisit(deps, host, visitId);
    const before = await snapshot();

    await expect(snackVisit(deps, host, visitId)).rejects.toMatchObject({
      code: "conflict",
    });

    expect(await snapshot()).toEqual(before);
  });

  it("is insufficient_seeds with 4 seeds and changes nothing (ac-3)", async () => {
    const host = world.priya.id;
    await deps.db.query("update profiles set seeds = 4 where id = $1", [host]);
    const before = await snapshot();

    await expect(
      snackVisit(deps, await callerFor(host), visitId),
    ).rejects.toMatchObject({ code: "insufficient_seeds" });

    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ["the owner", () => world.max.id],
    ["a stranger", () => world.rosa.id],
  ])("refuses %s as not_found and changes nothing", async (_, who) => {
    const before = await snapshot();

    await expect(
      snackVisit(deps, await callerFor(who()), visitId),
    ).rejects.toMatchObject({ code: "not_found" });

    expect(await snapshot()).toEqual(before);
  });

  it("refuses an id that is not a uuid as not_found", async () => {
    await expect(
      snackVisit(deps, await callerFor(world.priya.id), "not-a-uuid"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a visit past leaves_at as conflict and changes nothing", async () => {
    deps.clock.advance(31 * MINUTE);
    const before = await snapshot();

    await expect(
      snackVisit(deps, await callerFor(world.priya.id), visitId),
    ).rejects.toMatchObject({ code: "conflict" });

    expect(await snapshot()).toEqual(before);
  });

  it("refuses a visit that is no longer waiting as conflict", async () => {
    await deps.db.query("update visits set status = 'replied' where id = $1", [
      visitId,
    ]);

    await expect(
      snackVisit(deps, await callerFor(world.priya.id), visitId),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it.each([
    ["a plain bird", "city", [], 5],
    ["the bow tie", "city", ["bow"], 6],
    ["a Fantail", "fantail", [], 10],
    ["a Fantail in the bow tie", "fantail", ["bow", "bell"], 12],
  ])("tips the owner for %s (ac-2)", async (_, breed, gear, tip) => {
    await deps.db.query(
      "update birds set breed = $2, gear = $3 where id = $1",
      [birdId, breed, gear],
    );
    const owner = world.max.id;
    const before = await seedsOf(owner);

    await snackVisit(deps, await callerFor(world.priya.id), visitId);

    expect(await seedsOf(owner)).toBe(before + tip);
  });
});
