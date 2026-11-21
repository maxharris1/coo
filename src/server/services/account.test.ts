import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { OnboardedCaller } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import type { Row } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { deleteAccount } from "./account";
import { tick } from "./tick";

const MINUTE_MS = 60_000;

const OWNED_BY = {
  profiles: "id = $1",
  friendships: "a_id = $1 or b_id = $1",
  birds: "owner_id = $1",
  flights: "owner_id = $1",
  notes: "sender_id = $1",
  seed_ledger: "user_id = $1",
  eggs: "user_id = $1",
  events: "user_id = $1",
};

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

afterEach(() => vi.restoreAllMocks());

async function callerFor(person: Person): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Row<"profiles">>(
    "select * from profiles where id = $1",
    [person.id],
  );
  return {
    userId: person.id as UserId,
    profile: profile as OnboardedCaller["profile"],
  };
}

const deleteMax = async () => deleteAccount(deps, await callerFor(world.max));

const visitToMax = (from: Person, birdId = from.birds[0].id) =>
  insertWaitingVisit(deps.db, world, deps.clock.now(), {
    from,
    to: world.max,
    birdId,
  });

type ReturnRow = {
  bird_id: string;
  owner_id: string;
  counterpart_id: string | null;
  note_id: string | null;
  status: string;
  release_at: Date;
  to_label: string;
};

const returnsOf = (birdId: string) =>
  deps.db.query<ReturnRow>(
    "select * from flights where kind = 'return' and bird_id = $1",
    [birdId],
  );

const birdStatus = async (birdId: string) =>
  (
    await deps.db.query<{ status: string }>(
      "select status from birds where id = $1",
      [birdId],
    )
  )[0]?.status;

const count = async (sql: string, params: unknown[]) =>
  (await deps.db.query<{ n: number }>(sql, params))[0].n;

describe("deleteAccount", () => {
  it("sends a friend's bird waiting on the sill home on an empty return flight", async () => {
    const visit = await visitToMax(world.priya);
    const nowMs = deps.clock.now();

    expect(await deleteMax()).toEqual({ deleted: true });

    const returns = await returnsOf(visit.birdId);
    expect(returns).toHaveLength(1);
    expect(returns[0]).toMatchObject({
      owner_id: world.priya.id,
      note_id: null,
      status: "flying",
    });
    expect(returns[0].release_at.getTime()).toBe(nowMs);
    expect(await birdStatus(visit.birdId)).toBe("flying");
  });

  it("sends home a visit already past its leave time that the tick has not ended", async () => {
    const visit = await visitToMax(world.priya);
    deps.clock.advance((config.game.visits.waitMinutes + 5) * MINUTE_MS);

    await deleteMax();

    expect(await returnsOf(visit.birdId)).toHaveLength(1);
    expect(await birdStatus(visit.birdId)).toBe("flying");
  });

  it("sends a bird whose owner has no loft straight home with no flight", async () => {
    const visit = await visitToMax(world.priya);
    await deps.db.query(
      `update profiles set home_lat = null, home_lon = null, home_label = null,
         home_city = null, home_city_lat = null, home_city_lon = null
       where id = $1`,
      [world.priya.id],
    );

    await deleteMax();

    expect(await returnsOf(visit.birdId)).toEqual([]);
    expect(await birdStatus(visit.birdId)).toBe("home");
  });

  it("removes every row the schema test lists and keeps the friends' own data", async () => {
    const fromPriya = await visitToMax(world.priya);
    const seedsBefore = await count(
      "select seeds as n from profiles where id = $1",
      [world.priya.id],
    );

    await deleteMax();

    for (const [table, where] of Object.entries(OWNED_BY)) {
      expect(
        await count(`select count(*)::int as n from ${table} where ${where}`, [
          world.max.id,
        ]),
        table,
      ).toBe(0);
    }
    expect(
      await count("select count(*)::int as n from profiles where id = $1", [
        world.priya.id,
      ]),
    ).toBe(1);
    expect(
      await count("select seeds as n from profiles where id = $1", [
        world.priya.id,
      ]),
    ).toBe(seedsBefore);
    expect(
      await count("select count(*)::int as n from birds where owner_id = $1", [
        world.priya.id,
      ]),
    ).toBe(world.priya.birds.length);
    const [note] = await deps.db.query<{ recipient_id: string | null }>(
      "select recipient_id from notes where id = $1",
      [fromPriya.noteId],
    );
    expect(note).toEqual({ recipient_id: null });
    const nudged = await deps.db.query<{ user_id: string }>(
      "select user_id from events where kind = 'friends' order by user_id",
    );
    expect(nudged.map((e) => e.user_id)).toEqual(
      [world.priya.id, world.rosa.id].sort(),
    );
  });

  it("takes away the deleted user's own bird visiting a friend and leaves that sill clear", async () => {
    const mine = await insertWaitingVisit(deps.db, world, deps.clock.now(), {
      from: world.max,
      to: world.priya,
    });

    await deleteMax();

    expect(await birdStatus(mine.birdId)).toBeUndefined();
    expect(
      await count("select count(*)::int as n from visits where host_id = $1", [
        world.priya.id,
      ]),
    ).toBe(0);
    const result = await tick(deps);
    expect(result.failed).toEqual({});
  });

  it("lets a friend's delivery still in the air land and fly home with its note kept", async () => {
    const flight = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
      { from: world.priya, to: world.max },
    );

    await deleteMax();

    const [row] = await deps.db.query<{ counterpart_id: string | null }>(
      "select counterpart_id from flights where id = $1",
      [flight.flightId],
    );
    expect(row).toEqual({ counterpart_id: null });

    deps.clock.set(flight.arriveAtMs);
    expect((await tick(deps)).failed).toEqual({});
    deps.clock.advance((config.game.visits.waitMinutes + 1) * MINUTE_MS);
    expect((await tick(deps)).failed).toEqual({});
    const [ret] = await returnsOf(flight.birdId);
    deps.clock.set(ret.release_at.getTime() + 24 * 60 * MINUTE_MS);
    expect((await tick(deps)).failed).toEqual({});

    expect(await birdStatus(flight.birdId)).toBe("home");
    expect(
      await count("select count(*)::int as n from notes where id = $1", [
        flight.noteId,
      ]),
    ).toBe(1);
  });

  it("retries when a bird lands on the sill while the weather is fetched, and sends it home too", async () => {
    const first = await visitToMax(world.priya);
    let late: { birdId: string } | undefined;
    const samples = deps.weather.samples.bind(deps.weather);
    vi.spyOn(deps.weather, "samples").mockImplementation(async (at) => {
      if (!late) late = await visitToMax(world.rosa);
      return samples(at);
    });

    await deleteMax();

    expect(late).toBeDefined();
    for (const birdId of [first.birdId, late!.birdId]) {
      expect(await returnsOf(birdId), birdId).toHaveLength(1);
      expect(await birdStatus(birdId)).toBe("flying");
    }
  });

  it("still sends the bird home on fallback weather when the weather service fails", async () => {
    const visit = await visitToMax(world.priya);
    deps.weather.failNext();

    await deleteMax();

    expect(await returnsOf(visit.birdId)).toHaveLength(1);
    expect(await birdStatus(visit.birdId)).toBe("flying");
  });

  it("leaves the return flight for the tick to land with no failed rows", async () => {
    const visit = await visitToMax(world.priya);
    await deleteMax();

    deps.clock.advance(24 * 60 * MINUTE_MS);
    const result = await tick(deps);

    expect(result.failed).toEqual({});
    expect(await birdStatus(visit.birdId)).toBe("home");
  });

  it("deletes only the caller and leaves every other account whole", async () => {
    await deleteAccount(deps, await callerFor(world.priya));

    for (const person of [world.max, world.rosa]) {
      expect(
        await count("select count(*)::int as n from profiles where id = $1", [
          person.id,
        ]),
      ).toBe(1);
      expect(
        await count(
          "select count(*)::int as n from birds where owner_id = $1",
          [person.id],
        ),
      ).toBe(person.birds.length);
    }
  });
});
