import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { UserId } from "@/server/ports/auth";
import { listFlights, type FlightsPage } from "@/server/services/flights/list";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import {
  addDelivery,
  HOUR_MS,
  insertFlyingDelivery,
} from "@/test/fixtures/flights";
import { addNote } from "@/test/fixtures/notes";
import {
  insertPlannedDelivery,
  type PlannedDelivery,
} from "@/test/fixtures/plannedFlight";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { flightsView, type FlightsView } from "./flightsView";

const NY = "America/New_York";
const ONE_PM_NY = Date.UTC(2026, 10, 20, 18, 0);

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  deps.clock.set(ONE_PM_NY);
  world = await seedWorld(deps.db, deps.clock.now());
});

async function addBird(owner: Person, name: string): Promise<string> {
  const stats = config.game.start.birds[0];
  const now = new Date(deps.clock.now()).toISOString();
  const [{ id }] = await deps.db.query<{ id: string }>(
    `insert into birds (owner_id, name, speed_mph, focus, navigation,
       care_at, last_fed_at, hatched_at)
     values ($1, $2, $3, $4, $5, $6, $6, $6) returning id`,
    [owner.id, name, stats.speedMph, stats.focus, stats.navigation, now],
  );
  return id;
}

const landed = (from: Person, to: Person, landedMs: number) =>
  deps.db.tx(async (t) => {
    const noteId = await addNote(t, from, to, landedMs - HOUR_MS, true);
    return addDelivery(
      t,
      from,
      to,
      from.birds[1].id,
      noteId,
      "landed",
      landedMs - HOUR_MS,
      landedMs,
    );
  });

type Scenario = {
  toRosa: PlannedDelivery;
  toPriya: PlannedDelivery;
  scheduled: string;
  incoming: PlannedDelivery;
  landedLatest: string;
  landedEarlier: string;
};

async function threeOutOneIncomingTwoLanded(): Promise<Scenario> {
  const { max, priya, rosa } = world;
  const now = deps.clock.now();
  const toPriya = await insertPlannedDelivery(deps.db, world, now, {
    from: max,
    to: priya,
    birdId: max.birds[0].id,
    id: "00000000-0000-4000-9000-000000000011",
  });
  const toRosa = await insertPlannedDelivery(deps.db, world, now, {
    from: max,
    to: rosa,
    birdId: max.birds[1].id,
    dest: null,
    id: "00000000-0000-4000-9000-000000000012",
  });
  const { flightId: scheduled } = await insertFlyingDelivery(
    deps.db,
    world,
    now,
    { from: max, to: priya, birdId: await addBird(max, "Dot") },
  );
  await deps.db.query(
    `update flights set status = 'scheduled', arrive_at = null, release_at = $2
     where id = $1`,
    [scheduled, new Date(toPriya.arriveAtMs + HOUR_MS).toISOString()],
  );
  const incoming = await insertPlannedDelivery(deps.db, world, now, {
    from: priya,
    to: max,
    birdId: priya.birds[0].id,
    id: "00000000-0000-4000-9000-000000000013",
  });
  expect(toRosa.arriveAtMs).toBeLessThan(
    Math.min(toPriya.arriveAtMs, incoming.arriveAtMs),
  );
  const landedEarlier = await landed(priya, max, now - 3 * HOUR_MS);
  const landedLatest = await landed(rosa, max, now - HOUR_MS);
  return { toRosa, toPriya, scheduled, incoming, landedLatest, landedEarlier };
}

const flightsPage = (who: Person): Promise<FlightsPage> =>
  listFlights(deps, { userId: who.id as UserId, timezone: NY });

const rowIds = (view: FlightsView) =>
  Object.fromEntries(
    view.sections.map((s) => [s.title, s.rows.map((f) => f.id)]),
  );

describe("flightsView", () => {
  it("three of my flights out, one incoming and two landed today sit in the right sections in order", async () => {
    const s = await threeOutOneIncomingTwoLanded();

    const view = flightsView(
      await flightsPage(world.max),
      deps.clock.now(),
      NY,
    );

    expect(view.sections.map((x) => x.title)).toEqual([
      "Your birds",
      "Coming to you",
      "Landed today",
    ]);
    expect(rowIds(view)).toEqual({
      "Your birds": [s.toRosa.flightId, s.toPriya.flightId, s.scheduled],
      "Coming to you": [s.incoming.flightId],
      "Landed today": [s.landedLatest, s.landedEarlier],
    });
    expect(view.pill).toBe("3 out, 1 coming in");
  });

  it("moves a flight whose plan has landed to the top of Landed today without a refetch", async () => {
    const s = await threeOutOneIncomingTwoLanded();
    const page = await flightsPage(world.max);

    const view = flightsView(page, s.toRosa.arriveAtMs, NY);

    expect(rowIds(view)).toEqual({
      "Your birds": [s.toPriya.flightId, s.scheduled],
      "Coming to you": [s.incoming.flightId],
      "Landed today": [s.toRosa.flightId, s.landedLatest, s.landedEarlier],
    });
    expect(view.pill).toBe("2 out, 1 coming in");
  });

  it("orders flights that landed by plan between fetches latest first", async () => {
    const s = await threeOutOneIncomingTwoLanded();
    const page = await flightsPage(world.max);
    const later = Math.max(s.toPriya.arriveAtMs, s.incoming.arriveAtMs);
    const [first, second] =
      s.toPriya.arriveAtMs >= s.incoming.arriveAtMs
        ? [s.toPriya, s.incoming]
        : [s.incoming, s.toPriya];

    const view = flightsView(page, later, NY);

    expect(rowIds(view)).toEqual({
      "Your birds": [s.scheduled],
      "Coming to you": [],
      "Landed today": [
        first.flightId,
        second.flightId,
        s.toRosa.flightId,
        s.landedLatest,
        s.landedEarlier,
      ],
    });
    expect(view.pill).toBe("1 out, 0 coming in");
  });

  it("keeps Landed today newest first when a settled landing is newer than an overdue plan", async () => {
    const { max, priya, rosa } = world;
    const now = deps.clock.now();
    const older = await insertPlannedDelivery(deps.db, world, now, {
      from: max,
      to: rosa,
      id: "00000000-0000-4000-9000-000000000001",
    });
    const newer = await insertPlannedDelivery(deps.db, world, now, {
      from: priya,
      to: max,
      id: "00000000-0000-4000-9000-000000000002",
    });
    expect(older.arriveAtMs).toBeLessThan(newer.arriveAtMs);
    deps.clock.set(newer.arriveAtMs);
    const settled = await tick(deps, { userId: priya.id });
    expect(settled.counts.landDeliveries).toBe(1);
    const page = await flightsPage(max);
    expect(page.yours.map((f) => f.id)).toEqual([older.flightId]);
    expect(page.landedToday.map((f) => f.id)).toEqual([newer.flightId]);

    const view = flightsView(page, deps.clock.now(), NY);

    expect(rowIds(view)).toEqual({
      "Your birds": [],
      "Coming to you": [],
      "Landed today": [newer.flightId, older.flightId],
    });
  });

  it("leaves an overdue plan that landed before the viewer's local midnight out of Landed today", async () => {
    const flight = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
      {
        from: world.max,
        to: world.rosa,
        id: "00000000-0000-4000-9000-000000000003",
      },
    );
    deps.clock.set(Date.UTC(2026, 10, 21, 18));
    const page = await flightsPage(world.max);
    expect(page.yours.map((f) => f.id)).toEqual([flight.flightId]);
    expect(page.landedToday).toEqual([]);

    const view = flightsView(page, deps.clock.now(), NY);

    expect(rowIds(view)).toEqual({
      "Your birds": [],
      "Coming to you": [],
      "Landed today": [],
    });
    expect(view.pill).toBe("0 out, 0 coming in");
  });

  it("drops landings from Landed today once the viewer's local day rolls over after the fetch", async () => {
    const s = await threeOutOneIncomingTwoLanded();
    const page = await flightsPage(world.max);
    const nextMidnightNy = Date.UTC(2026, 10, 21, 5);

    const view = flightsView(page, nextMidnightNy, NY);

    expect(rowIds(view)).toEqual({
      "Your birds": [s.scheduled],
      "Coming to you": [],
      "Landed today": [],
    });
  });
});
