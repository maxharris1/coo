import { beforeEach, describe, expect, it } from "vitest";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld, type World } from "@/test/seedWorld";
import { releaseVisit } from "./release";
import { syncVisits } from "./syncRead";

const MINUTE = 60_000;

let deps: TestDeps;
let world: World;
let visitId: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  ({ visitId } = await insertWaitingVisit(deps.db, world, deps.clock.now()));
});

async function callerFor(id: string): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [id],
  );
  return { userId: id as UserId, profile };
}

async function snapshot() {
  const [visit] = await deps.db.query<{ status: string; leaves_at: Date }>(
    "select status, leaves_at from visits where id = $1",
    [visitId],
  );
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int as count from notes",
  );
  return {
    status: visit.status,
    leavesAt: visit.leaves_at.getTime(),
    notes: count,
  };
}

async function dueForTick(): Promise<string[]> {
  const rows = await deps.db.query<{ id: string }>(
    "select id from visits where status = 'waiting' and leaves_at <= $1",
    [new Date(deps.clock.now()).toISOString()],
  );
  return rows.map((r) => r.id);
}

describe("releaseVisit", () => {
  it("brings leaves_at forward to now so the tick sends the bird home (ac-4)", async () => {
    deps.clock.advance(5 * MINUTE);
    const now = deps.clock.now();
    const before = await snapshot();

    const result = await releaseVisit(
      deps,
      await callerFor(world.priya.id),
      visitId,
    );

    expect(result).toEqual({ leavesAt: now });
    expect(await snapshot()).toEqual({
      status: "waiting",
      leavesAt: now,
      notes: before.notes,
    });
    expect(await dueForTick()).toEqual([visitId]);
  });

  it("drops the visit from the host's and the owner's sync (ac-4)", async () => {
    await releaseVisit(deps, await callerFor(world.priya.id), visitId);

    const host = await syncVisits(deps, world.priya.id);
    const owner = await syncVisits(deps, world.max.id);
    expect(host.visits.map((v) => v.id)).not.toContain(visitId);
    expect(owner.myVisiting).toEqual([]);
  });

  it("is safe to run twice, even after time passes (ac-4)", async () => {
    const host = await callerFor(world.priya.id);
    const first = await releaseVisit(deps, host, visitId);
    const after = await snapshot();

    expect(await releaseVisit(deps, host, visitId)).toEqual(first);
    deps.clock.advance(MINUTE);
    expect(await releaseVisit(deps, host, visitId)).toEqual(first);

    expect(await snapshot()).toEqual(after);
  });

  it("refuses a visit that is no longer waiting as conflict", async () => {
    await deps.db.query("update visits set status = 'replied' where id = $1", [
      visitId,
    ]);
    const before = await snapshot();

    await expect(
      releaseVisit(deps, await callerFor(world.priya.id), visitId),
    ).rejects.toMatchObject({ code: "conflict" });

    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ["the owner", () => world.max.id],
    ["a stranger", () => world.rosa.id],
  ])("refuses %s as not_found and changes nothing (ac-6)", async (_, who) => {
    const before = await snapshot();

    await expect(
      releaseVisit(deps, await callerFor(who()), visitId),
    ).rejects.toMatchObject({ code: "not_found" });

    expect(await snapshot()).toEqual(before);
  });

  it("refuses an id that is not a uuid as not_found", async () => {
    await expect(
      releaseVisit(deps, await callerFor(world.priya.id), "not-a-uuid"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
