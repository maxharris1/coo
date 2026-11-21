import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { addDelivery } from "@/test/fixtures/flights";
import { addNote } from "@/test/fixtures/notes";
import {
  insertPlannedDelivery,
  type PlannedDelivery,
} from "@/test/fixtures/plannedFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { tick } from "../tick";
import { landDeliveries } from "./landDeliveries";

const MINUTE_MS = 60_000;

let deps: TestDeps;
let world: World;
let flight: PlannedDelivery;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  flight = await insertPlannedDelivery(deps.db, world, deps.clock.now());
});

const iso = (ms: number) => new Date(ms).toISOString();

async function rows<T>(sql: string, params: unknown[] = []) {
  return deps.db.query<T>(sql, params);
}

const SNAPSHOT_TABLES = [
  "flights",
  "notes",
  "birds",
  "visits",
  "seed_ledger",
  "profiles",
  "punch_cards",
  "postmarks",
  "eggs",
  "badges",
  "bird_meetings",
  "notifications",
  "events",
];

async function snapshot() {
  const out: Record<string, unknown[]> = {};
  for (const table of SNAPSHOT_TABLES) {
    out[table] = await rows(`select * from ${table} order by 1, 2`);
  }
  return out;
}

async function counts() {
  const [c] = await rows<Record<string, number>>(
    `select
       (select count(*)::int from visits) as visits,
       (select count(*)::int from seed_ledger where reason = 'delivery') as delivery_pay,
       (select count(*)::int from seed_ledger where reason = 'new_city') as new_city_pay,
       (select count(*)::int from notifications where kind = 'landed-in') as landed_in,
       (select count(*)::int from notifications where kind = 'landed-out') as landed_out,
       (select count(*)::int from postmarks) as postmarks,
       (select count(*)::int from bird_meetings) as meetings,
       (select count(*)::int from events) as events,
       (select deliveries_count from profiles where id = $1) as max_deliveries,
       (select seeds from profiles where id = $1) as max_seeds,
       (select deliveries from birds where id = $2) as bird_deliveries`,
    [world.max.id, flight.birdId],
  );
  return c;
}

describe("landing a delivery", () => {
  it("does nothing before the arrival time", async () => {
    deps.clock.set(flight.arriveAtMs - MINUTE_MS);
    const before = await snapshot();

    const result = await tick(deps);

    expect(result.counts.landDeliveries).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it("scenario 1: delivers the note, starts the visit, pays Max 13 + 25 and notifies both once", async () => {
    const [{ seeds: seedsBefore }] = await rows<{ seeds: number }>(
      "select seeds from profiles where id = $1",
      [world.max.id],
    );
    deps.clock.set(flight.arriveAtMs + 5 * MINUTE_MS);

    const result = await tick(deps);

    expect(result.counts.landDeliveries).toBe(1);
    expect(flight.distanceMi).toBeGreaterThanOrEqual(75);
    expect(flight.distanceMi).toBeLessThan(100);

    const [f] = await rows<{ status: string; landed_at: Date }>(
      "select status, landed_at from flights where id = $1",
      [flight.flightId],
    );
    expect(f.status).toBe("landed");
    expect(f.landed_at.toISOString()).toBe(iso(flight.arriveAtMs));

    const [note] = await rows<{ delivered_at: Date }>(
      "select delivered_at from notes where id = $1",
      [flight.noteId],
    );
    expect(note.delivered_at.toISOString()).toBe(iso(flight.arriveAtMs));

    const visits = await rows<{
      id: string;
      status: string;
      host_id: string;
      bird_id: string;
      note_id: string;
      arrived_at: Date;
      leaves_at: Date;
    }>("select * from visits where flight_id = $1", [flight.flightId]);
    expect(visits).toHaveLength(1);
    const [visit] = visits;
    expect(visit).toMatchObject({
      status: "waiting",
      host_id: world.priya.id,
      bird_id: flight.birdId,
      note_id: flight.noteId,
    });
    expect(visit.arrived_at.toISOString()).toBe(iso(flight.arriveAtMs));
    expect(visit.leaves_at.toISOString()).toBe(
      iso(flight.arriveAtMs + 30 * MINUTE_MS),
    );

    const ledger = await rows<{ reason: string; delta: number }>(
      `select reason, delta from seed_ledger
       where user_id = $1 and ref_id = $2 order by reason`,
      [world.max.id, flight.flightId],
    );
    expect(ledger).toEqual([
      { reason: "delivery", delta: 13 },
      { reason: "new_city", delta: 25 },
    ]);
    const [{ seeds, deliveries_count }] = await rows<{
      seeds: number;
      deliveries_count: number;
    }>("select seeds, deliveries_count from profiles where id = $1", [
      world.max.id,
    ]);
    expect(seeds).toBe(seedsBefore + 38);
    expect(deliveries_count).toBe(1);

    const notifications = await rows<{
      user_id: string;
      kind: string;
      ref_id: string;
      title: string;
      body: string;
      url: string;
    }>(
      "select user_id, kind, ref_id, title, body, url from notifications order by kind",
    );
    expect(notifications).toEqual([
      {
        user_id: world.priya.id,
        kind: "landed-in",
        ref_id: visit.id,
        title: "Gerald has landed",
        body: "There is a note from Max on your sill.",
        url: `/sill/${visit.id}`,
      },
      {
        user_id: world.max.id,
        kind: "landed-out",
        ref_id: flight.flightId,
        title: "Gerald delivered your note",
        body: expect.stringMatching(
          /^Priya has it\. \d+ miles in .+\. You earned 38 seeds\.$/,
        ),
        url: `/flights/${flight.flightId}`,
      },
    ]);

    const [bird] = await rows<{
      status: string;
      miles: number;
      deliveries: number;
      care_at: Date;
    }>("select status, miles, deliveries, care_at from birds where id = $1", [
      flight.birdId,
    ]);
    expect(bird.status).toBe("visiting");
    expect(bird.miles).toBeCloseTo(flight.distanceMi, 1);
    expect(bird.deliveries).toBe(1);
    expect(bird.care_at.toISOString()).toBe(iso(flight.arriveAtMs));

    const postmarks = await rows<{ place_key: string; flight_id: string }>(
      "select place_key, flight_id from postmarks where user_id = $1",
      [world.max.id],
    );
    expect(postmarks).toEqual([
      { place_key: "philadelphia|pennsylvania|us", flight_id: flight.flightId },
    ]);

    const meetings = await rows<{ user_id: string; bird_id: string }>(
      "select user_id, bird_id from bird_meetings",
    );
    expect(meetings).toEqual([
      { user_id: world.priya.id, bird_id: flight.birdId },
    ]);

    const events = await rows<{ user_id: string }>(
      "select user_id from events order by user_id",
    );
    expect(new Set(events.map((e) => e.user_id))).toEqual(
      new Set([world.max.id, world.priya.id]),
    );
  });

  it("scenario 8: two ticks at once for the same flight produce one of everything", async () => {
    deps.clock.set(flight.arriveAtMs + MINUTE_MS);

    const results = await Promise.all([tick(deps), tick(deps)]);

    expect(results.map((r) => r.counts.landDeliveries).sort()).toEqual([0, 1]);
    const c = await counts();
    expect(c).toMatchObject({
      visits: 1,
      delivery_pay: 1,
      new_city_pay: 1,
      landed_in: 1,
      landed_out: 1,
      postmarks: 1,
      meetings: 1,
      max_deliveries: 1,
      bird_deliveries: 1,
    });
  });

  it("scenario 8: the landing step run twice in parallel lands once", async () => {
    deps.clock.set(flight.arriveAtMs + MINUTE_MS);
    const ctx = { deps, limit: 50, timeUp: () => false };

    const results = await Promise.all([
      landDeliveries(ctx),
      landDeliveries(ctx),
    ]);

    expect(results.map((r) => r.count).sort()).toEqual([0, 1]);
    expect(await counts()).toMatchObject({
      visits: 1,
      delivery_pay: 1,
      landed_in: 1,
      landed_out: 1,
    });
  });

  it("a second tick changes nothing", async () => {
    deps.clock.set(flight.arriveAtMs + MINUTE_MS);
    await tick(deps);
    const after = await snapshot();

    deps.clock.advance(MINUTE_MS);
    const second = await tick(deps);

    expect(second.counts.landDeliveries).toBe(0);
    expect(await snapshot()).toEqual(after);
  });

  it("a second delivery to the same city pays no new-city seeds and adds no postmark", async () => {
    deps.clock.set(flight.arriveAtMs + MINUTE_MS);
    await tick(deps);
    const next = await insertPlannedDelivery(deps.db, world, deps.clock.now(), {
      birdId: world.max.birds[1].id,
    });
    deps.clock.set(next.arriveAtMs + MINUTE_MS);

    await tick(deps);

    const ledger = await rows<{ reason: string }>(
      "select reason from seed_ledger where ref_id = $1 order by reason",
      [next.flightId],
    );
    expect(ledger).toEqual([{ reason: "delivery" }]);
    const [{ n }] = await rows<{ n: number }>(
      "select count(*)::int as n from postmarks",
    );
    expect(n).toBe(1);
  });

  it("only lands flights owned by or aimed at the user it ticks for", async () => {
    deps.clock.set(flight.arriveAtMs + MINUTE_MS);

    const rosa = await tick(deps, { userId: world.rosa.id });
    expect(rosa.counts.landDeliveries).toBe(0);

    const priya = await tick(deps, { userId: world.priya.id });
    expect(priya.counts.landDeliveries).toBe(1);
  });

  it("ends the recipient's landed-in title with Ding. when the bird wears the ankle bell", async () => {
    await deps.db.query("update birds set gear = '{bell}' where id = $1", [
      flight.birdId,
    ]);
    deps.clock.set(flight.arriveAtMs + MINUTE_MS);

    await tick(deps);

    const titles = await rows<{ kind: string; title: string }>(
      "select kind, title from notifications order by kind",
    );
    expect(titles).toEqual([
      { kind: "landed-in", title: "Gerald has landed Ding." },
      { kind: "landed-out", title: "Gerald delivered your note" },
    ]);
  });

  describe("the egg", () => {
    async function layEgg(hatchAt: number, deliveriesSoFar: number) {
      await deps.db.query(
        "insert into eggs (user_id, hatch_at_delivery) values ($1, $2)",
        [world.max.id, hatchAt],
      );
      await deps.db.query(
        "update profiles set deliveries_count = $2 where id = $1",
        [world.max.id, deliveriesSoFar],
      );
    }

    async function eggStatus() {
      const [egg] = await rows<{ status: string }>(
        "select status from eggs where user_id = $1",
        [world.max.id],
      );
      return egg.status;
    }

    it("the fifth delivery sets the egg ready", async () => {
      await layEgg(5, 4);
      deps.clock.set(flight.arriveAtMs + MINUTE_MS);

      await tick(deps);

      expect(await eggStatus()).toBe("ready");
    });

    it("the fourth delivery leaves the egg incubating", async () => {
      await layEgg(5, 3);
      deps.clock.set(flight.arriveAtMs + MINUTE_MS);

      await tick(deps);

      expect(await eggStatus()).toBe("incubating");
    });
  });

  describe("the punch card", () => {
    const THIS_MONDAY = "2026-11-16";

    async function card() {
      return rows<{ week_start: string; deliveries: number; paid: boolean }>(
        `select to_char(week_start, 'YYYY-MM-DD') as week_start, deliveries, paid
         from punch_cards where user_id = $1 order by week_start`,
        [world.max.id],
      );
    }

    async function punchPay() {
      return rows<{ ref_id: string; delta: number }>(
        "select ref_id, delta from seed_ledger where user_id = $1 and reason = 'punch_card'",
        [world.max.id],
      );
    }

    it("starts this week's card at one", async () => {
      deps.clock.set(flight.arriveAtMs + MINUTE_MS);

      await tick(deps);

      expect(await card()).toEqual([
        { week_start: THIS_MONDAY, deliveries: 1, paid: false },
      ]);
      expect(await punchPay()).toEqual([]);
    });

    it("the tenth delivery in a week pays 50 once", async () => {
      await deps.db.query(
        "insert into punch_cards (user_id, week_start, deliveries) values ($1, $2, 9)",
        [world.max.id, THIS_MONDAY],
      );
      const [{ seeds: seedsBefore }] = await rows<{ seeds: number }>(
        "select seeds from profiles where id = $1",
        [world.max.id],
      );
      deps.clock.set(flight.arriveAtMs + MINUTE_MS);

      await tick(deps);

      expect(await card()).toEqual([
        { week_start: THIS_MONDAY, deliveries: 10, paid: true },
      ]);
      expect(await punchPay()).toEqual([
        { ref_id: flight.flightId, delta: 50 },
      ]);
      const [{ seeds }] = await rows<{ seeds: number }>(
        "select seeds from profiles where id = $1",
        [world.max.id],
      );
      expect(seeds).toBe(seedsBefore + 13 + 25 + 50);
      const [out] = await rows<{ body: string }>(
        "select body from notifications where kind = 'landed-out'",
      );
      expect(out.body).toMatch(/You earned 88 seeds\.$/);

      const eleventh = await insertPlannedDelivery(
        deps.db,
        world,
        deps.clock.now(),
        { birdId: world.max.birds[1].id },
      );
      deps.clock.set(eleventh.arriveAtMs + MINUTE_MS);
      await tick(deps);

      expect(await card()).toEqual([
        { week_start: THIS_MONDAY, deliveries: 11, paid: true },
      ]);
      expect(await punchPay()).toEqual([
        { ref_id: flight.flightId, delta: 50 },
      ]);
    });

    it("last week's full card does not count toward this week", async () => {
      await deps.db.query(
        "insert into punch_cards (user_id, week_start, deliveries) values ($1, '2026-11-09', 9)",
        [world.max.id],
      );
      deps.clock.set(flight.arriveAtMs + MINUTE_MS);

      await tick(deps);

      expect(await card()).toEqual([
        { week_start: "2026-11-09", deliveries: 9, paid: false },
        { week_start: THIS_MONDAY, deliveries: 1, paid: false },
      ]);
      expect(await punchPay()).toEqual([]);
    });
  });

  describe("the daily pay cap", () => {
    async function landedEarlier(landedAtMs: number[]) {
      await deps.db.tx(async (t) => {
        for (const at of landedAtMs) {
          const noteId = await addNote(t, world.max, world.priya, at, true);
          const id = await addDelivery(
            t,
            world.max,
            world.priya,
            world.max.birds[1].id,
            noteId,
            "landed",
            at - HOUR,
            at,
          );
          await t.query("select apply_seeds($1, 13, 'delivery', $2)", [
            world.max.id,
            id,
          ]);
        }
      });
    }

    async function deliveryPayFor(flightId: string) {
      const [row] = await rows<{ delta: number }>(
        "select delta from seed_ledger where reason = 'delivery' and ref_id = $1",
        [flightId],
      );
      return row.delta;
    }

    const HOUR = 60 * MINUTE_MS;
    const NY_MIDNIGHT = Date.UTC(2026, 10, 19, 5);

    it("the 11th delivery of the local day pays 2", async () => {
      await landedEarlier(
        Array.from(
          { length: 10 },
          (_, i) => NY_MIDNIGHT + (i + 1) * 15 * MINUTE_MS,
        ),
      );
      deps.clock.set(flight.arriveAtMs + MINUTE_MS);

      await tick(deps);

      expect(await deliveryPayFor(flight.flightId)).toBe(2);
    });

    it("the 10th delivery of the local day still pays in full", async () => {
      await landedEarlier(
        Array.from(
          { length: 9 },
          (_, i) => NY_MIDNIGHT + (i + 1) * 15 * MINUTE_MS,
        ),
      );
      deps.clock.set(flight.arriveAtMs + MINUTE_MS);

      await tick(deps);

      expect(await deliveryPayFor(flight.flightId)).toBe(13);
    });

    it("deliveries before local midnight count toward yesterday", async () => {
      await landedEarlier(
        Array.from({ length: 10 }, (_, i) => NY_MIDNIGHT - (i + 1) * MINUTE_MS),
      );
      deps.clock.set(flight.arriveAtMs + MINUTE_MS);

      await tick(deps);

      expect(await deliveryPayFor(flight.flightId)).toBe(13);
    });
  });
});
