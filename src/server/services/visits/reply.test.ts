import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld, type World } from "@/test/seedWorld";
import { tick } from "../tick";
import { replyToVisit } from "./reply";

const MINUTE = 60_000;
const { baseLimit, tubeLimit } = config.game.notes;

let deps: TestDeps;
let world: World;
let visit: Awaited<ReturnType<typeof insertWaitingVisit>>;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  visit = await insertWaitingVisit(deps.db, world, deps.clock.now());
});

async function callerFor(id: string): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [id],
  );
  return { userId: id as UserId, profile };
}

const reply = async (who: string, body: string, id = visit.visitId) =>
  replyToVisit(deps, await callerFor(who), id, body);

async function snapshot() {
  const [row] = await deps.db.query<{
    notes: number;
    returns: number;
    ledger: number;
    status: string;
    bird: string;
  }>(
    `select (select count(*)::int from notes) as notes,
       (select count(*)::int from flights where kind = 'return') as returns,
       (select count(*)::int from seed_ledger) as ledger,
       (select status from visits where id = $1) as status,
       (select status from birds where id = $2) as bird`,
    [visit.visitId, visit.birdId],
  );
  return row;
}

const returnFlights = () =>
  deps.db.query<{
    id: string;
    note_id: string | null;
    bird_id: string;
    owner_id: string;
    counterpart_id: string | null;
    status: string;
    to_lat: number;
    to_lon: number;
    to_label: string;
  }>("select * from flights where kind = 'return'");

describe("replyToVisit", () => {
  it("creates the reply note and the return flight home and marks the visit replied", async () => {
    const { flight } = await reply(world.priya.id, "  Thanks, Max!  ");

    const [ret] = await returnFlights();
    expect(flight.id).toBe(ret.id);
    expect(ret).toMatchObject({
      bird_id: visit.birdId,
      owner_id: world.max.id,
      counterpart_id: world.priya.id,
      status: "flying",
      to_label: "East Village",
    });
    const [note] = await deps.db.query<{
      sender_id: string;
      recipient_id: string;
      body: string;
      reply_to: string;
      delivered_at: Date | null;
    }>("select * from notes where id = $1", [ret.note_id]);
    expect(note).toMatchObject({
      sender_id: world.priya.id,
      recipient_id: world.max.id,
      body: "Thanks, Max!",
      reply_to: visit.noteId,
      delivered_at: null,
    });
    const [row] = await deps.db.query<{
      status: string;
      return_flight_id: string;
    }>("select status, return_flight_id from visits where id = $1", [
      visit.visitId,
    ]);
    expect(row).toEqual({ status: "replied", return_flight_id: ret.id });
  });

  it("costs the host nothing and the tick does not start a second return", async () => {
    const before = await snapshot();
    await reply(world.priya.id, "Thanks!");
    deps.clock.advance(config.game.visits.waitMinutes * MINUTE);
    await tick(deps);

    expect(await returnFlights()).toHaveLength(1);
    expect((await snapshot()).ledger).toBe(before.ledger);
  });

  it("refuses a reply after leaves_at as conflict and creates nothing (ac-2)", async () => {
    deps.clock.advance(config.game.visits.waitMinutes * MINUTE);
    const before = await snapshot();

    await expect(reply(world.priya.id, "Too late")).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await snapshot()).toEqual(before);
    expect(before.status).toBe("waiting");
  });

  it("refuses a second reply as conflict and creates nothing (ac-2)", async () => {
    await reply(world.priya.id, "First");
    const before = await snapshot();

    await expect(reply(world.priya.id, "Second")).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ["a stranger", () => world.rosa.id],
    ["the bird's owner", () => world.max.id],
  ])(
    "refuses %s replying to a visit that is not theirs as not_found and creates nothing (ac-2)",
    async (_, who) => {
      const before = await snapshot();

      await expect(reply(who(), "Hello")).rejects.toMatchObject({
        code: "not_found",
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  it("refuses a malformed visit id as not_found", async () => {
    await expect(
      reply(world.priya.id, "Hello", "not-a-uuid"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses an empty body as invalid and creates nothing", async () => {
    const before = await snapshot();
    await expect(reply(world.priya.id, "   ")).rejects.toMatchObject({
      code: "invalid",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("holds the reply to the visiting bird's limit, not the host's birds (ac-3)", async () => {
    await deps.db.query(
      "update birds set gear = array['tube'], breed = 'pouter' where owner_id = $1",
      [world.priya.id],
    );
    const before = await snapshot();

    await expect(
      reply(world.priya.id, "a".repeat(baseLimit + 1)),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(await snapshot()).toEqual(before);

    await reply(world.priya.id, "a".repeat(baseLimit));
    expect(await returnFlights()).toHaveLength(1);
  });

  it("raises the limit when the visiting bird wears the tube (ac-3)", async () => {
    await deps.db.query("update birds set gear = array['tube'] where id = $1", [
      visit.birdId,
    ]);

    await expect(
      reply(world.priya.id, "a".repeat(tubeLimit + 1)),
    ).rejects.toMatchObject({ code: "invalid" });
    await reply(world.priya.id, "a".repeat(tubeLimit));
    expect(await returnFlights()).toHaveLength(1);
  });

  it("aims the return at the owner's active loft when the reply starts it (ac-4)", async () => {
    await deps.db.query(
      `update profiles set travel_on = true, travel_lat = 41.88, travel_lon = -87.63,
         travel_label = 'The Loop', travel_city = 'Chicago',
         travel_city_lat = 41.878, travel_city_lon = -87.629
       where id = $1`,
      [world.max.id],
    );

    await reply(world.priya.id, "Safe travels");

    const [ret] = await returnFlights();
    expect(ret).toMatchObject({
      to_lat: 41.88,
      to_lon: -87.63,
      to_label: "The Loop",
    });
  });
});
