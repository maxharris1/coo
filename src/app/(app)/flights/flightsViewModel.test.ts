import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { UserId } from "@/server/ports/auth";
import { listFlights, type FlightsPage } from "@/server/services/flights/list";
import type { Flight } from "@/server/services/flights/shape";
import { FakeClock } from "@/test/fakes/clock";
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
import { flightsView, type FlightsView } from "./flightsViewModel";

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
      "mi",
    );

    expect(view.sections.map((x) => x.title)).toEqual([
      "In the air",
      "Landed today",
    ]);
    expect(rowIds(view)).toEqual({
      "In the air": [
        s.toRosa.flightId,
        s.toPriya.flightId,
        s.scheduled,
        s.incoming.flightId,
      ],
      "Landed today": [s.landedLatest, s.landedEarlier],
    });
    expect(view.pill).toBe("3 out, 1 coming in");
  });

  it("moves a flight whose plan has landed to the top of Landed today without a refetch", async () => {
    const s = await threeOutOneIncomingTwoLanded();
    const page = await flightsPage(world.max);

    const view = flightsView(page, s.toRosa.arriveAtMs, NY, "mi");

    expect(rowIds(view)).toEqual({
      "In the air": [s.toPriya.flightId, s.scheduled, s.incoming.flightId],
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

    const view = flightsView(page, later, NY, "mi");

    expect(rowIds(view)).toEqual({
      "In the air": [s.scheduled],
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

    const view = flightsView(page, deps.clock.now(), NY, "mi");

    expect(rowIds(view)).toEqual({
      "In the air": [],
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

    const view = flightsView(page, deps.clock.now(), NY, "mi");

    expect(rowIds(view)).toEqual({
      "In the air": [],
      "Landed today": [],
    });
    expect(view.pill).toBe("0 out, 0 coming in");
  });

  it("drops landings from Landed today once the viewer's local day rolls over after the fetch", async () => {
    const s = await threeOutOneIncomingTwoLanded();
    const page = await flightsPage(world.max);
    const nextMidnightNy = Date.UTC(2026, 10, 21, 5);

    const view = flightsView(page, nextMidnightNy, NY, "mi");

    expect(rowIds(view)).toEqual({
      "In the air": [s.scheduled],
      "Landed today": [],
    });
  });
});

type Vector = { name: string; input: FlightInput; plan: FlightPlan };

const vectors: Vector[] = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors;

const DECILES = [
  "Brooklyn, NY",
  "Bayonne, NJ",
  "Elizabeth, NJ",
  "Rahway, NJ",
  "Edison, NJ",
  "New Brunswick, NJ",
  "Princeton, NJ",
  "Trenton, NJ",
  "Bristol, PA",
  "Bensalem, PA",
  "Philadelphia, PA",
];

function vectorFlight(name: string, over: Partial<Flight> = {}): Flight {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`vectors.json has no ${name} vector`);
  return {
    id: v.input.flightId,
    kind: "delivery",
    status: "flying",
    bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
    owner: { id: "u1", name: "Max", handle: "max" },
    counterpart: { id: "u2", name: "Priya", handle: "priya" },
    from: { ...v.input.from, label: "Brooklyn, NY" },
    to: { ...v.input.to, label: "Philadelphia, PA" },
    releaseAt: v.input.departAtMs,
    arriveAt: v.plan.arriveAtMs,
    distanceMi: v.plan.distanceMi,
    plan: v.plan,
    placeNames: { deciles: DECILES },
    role: "mine",
    hasNote: true,
    ...over,
  };
}

const pageOf = (flight: Flight): FlightsPage => ({
  yours: flight.role === "mine" ? [flight] : [],
  incoming: flight.role === "incoming" ? [flight] : [],
  landedToday: [],
  earlier: [],
  nextCursor: null,
});

const rowsAt = (page: FlightsPage, clock: FakeClock) =>
  Object.fromEntries(
    flightsView(page, clock.now(), NY, "mi").sections.map((s) => [
      s.title,
      s.rows.map(({ title, line, chip }) => ({ title, line, chip })),
    ]),
  );

const cardsAt = (page: FlightsPage, clock: FakeClock) =>
  flightsView(page, clock.now(), NY, "mi").sections[0].rows.map(
    ({ bird, other, direction, label }) => ({ bird, other, direction, label }),
  );

describe("flightsView status lines", () => {
  it("a delayed flight's row reads Flying, then Delayed, then sits in Landed today as the clock moves", () => {
    const flight = vectorFlight("delay-major");
    const [fly, delay] = flight.plan!.segments;
    const page = pageOf(flight);
    const clock = new FakeClock(fly.startMs + (fly.endMs - fly.startMs) / 2);

    expect(rowsAt(page, clock)).toEqual({
      "In the air": [
        {
          title: "Gerald to Priya",
          line: "Over Bayonne, NJ. Lands this afternoon.",
          chip: { text: "Flying", tone: "sun" },
        },
      ],
      "Landed today": [],
    });
    expect(cardsAt(page, clock)).toEqual([
      {
        bird: "Gerald",
        other: "Priya",
        direction: "sent",
        label:
          "Gerald, Flying, to Priya. Over Bayonne, NJ. Lands this afternoon.",
      },
    ]);

    clock.set(delay.startMs + 60_000);
    expect(rowsAt(page, clock)).toEqual({
      "In the air": [
        {
          title: "Gerald to Priya",
          line: "Last seen near Elizabeth, NJ.",
          chip: { text: "Delayed", tone: "tomato" },
        },
      ],
      "Landed today": [],
    });
    expect(cardsAt(page, clock)).toEqual([
      {
        bird: "Gerald",
        other: "Priya",
        direction: "sent",
        label: "Gerald, Delayed, to Priya. Last seen near Elizabeth, NJ.",
      },
    ]);

    clock.set(flight.plan!.arriveAtMs + 60_000);
    expect(rowsAt(page, clock)).toEqual({
      "In the air": [],
      "Landed today": [
        { title: "Gerald to Priya, 82 miles", line: "5h 10m", chip: undefined },
      ],
    });
  });

  it("an incoming bird says when it lands on your sill and reads Almost here in the last tenth", () => {
    const flight = vectorFlight("calm-short", {
      role: "incoming",
      owner: { id: "u2", name: "Priya", handle: "priya" },
      counterpart: { id: "u1", name: "Max", handle: "max" },
      bird: { id: "b2", name: "Dumpling", look: "dumpling", gear: [] },
    });
    const page = pageOf(flight);
    const arrive = flight.plan!.arriveAtMs;
    const clock = new FakeClock(arrive - 60 * 60_000);

    expect(rowsAt(page, clock)["In the air"]).toEqual([
      {
        title: "Dumpling from Priya",
        line: "Lands on your sill around midday.",
        chip: { text: "Flying", tone: "sun" },
      },
    ]);

    clock.set(arrive - 5 * 60_000);
    expect(rowsAt(page, clock)["In the air"]).toEqual([
      {
        title: "Dumpling from Priya",
        line: "Lands on your sill any minute now.",
        chip: { text: "Almost here", tone: "mint" },
      },
    ]);
    expect(cardsAt(page, clock)).toEqual([
      {
        bird: "Dumpling",
        other: "Priya",
        direction: "received",
        label:
          "Dumpling, Almost here, from Priya. Lands on your sill any minute now.",
      },
    ]);
  });

  it("a bird flying home reads as coming from the host and never promises a sill, in the owner's view", () => {
    const out = vectorFlight("calm-short");
    const flight = vectorFlight("calm-short", {
      kind: "return",
      from: out.to,
      to: out.from,
      placeNames: { deciles: [...DECILES].reverse() },
    });
    const page = pageOf(flight);
    const arrive = flight.plan!.arriveAtMs;
    const clock = new FakeClock((flight.releaseAt + arrive) / 2);

    expect(rowsAt(page, clock)).toEqual({
      "In the air": [
        {
          title: "Gerald from Priya",
          line: "Over New Brunswick, NJ. Lands around midday.",
          chip: { text: "Flying", tone: "sun" },
        },
      ],
      "Landed today": [],
    });

    clock.set(arrive - 5 * 60_000);
    expect(rowsAt(page, clock)["In the air"]).toEqual([
      {
        title: "Gerald from Priya",
        line: "Over Brooklyn, NY. Lands any minute now.",
        chip: { text: "Flying", tone: "sun" },
      },
    ]);
    expect(cardsAt(page, clock)).toEqual([
      {
        bird: "Gerald",
        other: "Priya",
        direction: "sent",
        label:
          "Gerald, Flying, from Priya. Over Brooklyn, NY. Lands any minute now.",
      },
    ]);
  });

  it("a bird flying home reads as going to its owner and never lands on the host's sill, in the host's view", () => {
    const out = vectorFlight("calm-short");
    const flight = vectorFlight("calm-short", {
      kind: "return",
      role: "incoming",
      from: out.to,
      to: out.from,
      placeNames: { deciles: [...DECILES].reverse() },
    });
    const page = pageOf(flight);
    const arrive = flight.plan!.arriveAtMs;
    const clock = new FakeClock((flight.releaseAt + arrive) / 2);

    expect(rowsAt(page, clock)["In the air"]).toEqual([
      {
        title: "Gerald to Max",
        line: "Over New Brunswick, NJ. Lands around midday.",
        chip: { text: "Flying", tone: "sun" },
      },
    ]);

    clock.set(arrive - 5 * 60_000);
    expect(rowsAt(page, clock)["In the air"]).toEqual([
      {
        title: "Gerald to Max",
        line: "Over Brooklyn, NY. Lands any minute now.",
        chip: { text: "Flying", tone: "sun" },
      },
    ]);
    expect(cardsAt(page, clock)).toEqual([
      {
        bird: "Gerald",
        other: "Max",
        direction: "received",
        label:
          "Gerald, Flying, to Max. Over Brooklyn, NY. Lands any minute now.",
      },
    ]);
  });

  it.each([
    ["no deciles", {}],
    ["a deciles list missing the current tenth", { deciles: [] }],
    ["only unnamed tenths", { deciles: DECILES.map(() => null) }],
  ])(
    "drops the place sentence rather than naming the start when there are %s",
    (_, placeNames: Flight["placeNames"]) => {
      const lineAt = (flight: Flight, at: number) =>
        flightsView(pageOf(flight), at, NY, "mi").sections[0].rows[0].line;

      const flying = vectorFlight("calm-short", { placeNames });
      expect(
        lineAt(flying, (flying.releaseAt + flying.plan!.arriveAtMs) / 2),
      ).toBe("Lands around midday.");

      const overnight = vectorFlight("chicago-overnight", { placeNames });
      const roost = overnight.plan!.segments[1];
      expect(roost.kind).toBe("roost");
      expect(lineAt(overnight, roost.startMs + HOUR_MS)).toBe(
        "Lands tomorrow afternoon.",
      );

      const delayed = vectorFlight("delay-major", { placeNames });
      const delay = delayed.plan!.segments[1];
      expect(lineAt(delayed, delay.startMs + 60_000)).toBe("");
    },
  );
});

describe("flightsView live rows print no clock or countdown", () => {
  const CLOCK = /\d{1,2}:\d{2}\s?(am|pm)/i;
  const COUNTDOWN = /\d+h \d+m|\d+ min|\d+ sec|Lands in|Leaves in/;
  const linesAt = (flight: Flight, at: number) =>
    flightsView(pageOf(flight), at, NY, "mi").sections.flatMap((s) =>
      s.rows.map((r) => r.line),
    );

  it("says when a scheduled bird takes off as a time of day", () => {
    const flight = vectorFlight("calm-short");
    expect(linesAt(flight, flight.releaseAt - 3 * HOUR_MS)).toEqual([
      "Takes off this morning.",
    ]);
  });

  it.each(["calm-short", "chicago-overnight", "delay-major", "block"])(
    "keeps every in-progress line of the %s vector free of clocks and countdowns",
    (name) => {
      for (const role of ["mine", "incoming"] as const) {
        const flight = vectorFlight(name, { role });
        const { arriveAtMs } = flight.plan!;
        for (let frac = 0; frac < 1; frac += 0.05) {
          const at = flight.releaseAt + (arriveAtMs - flight.releaseAt) * frac;
          for (const line of linesAt(flight, at)) {
            expect(line).not.toMatch(CLOCK);
            expect(line).not.toMatch(COUNTDOWN);
          }
        }
      }
    },
  );

  it("keeps the landed row's trip length", () => {
    const flight = vectorFlight("calm-short");
    expect(linesAt(flight, flight.plan!.arriveAtMs + 60_000)).toEqual([
      "1h 49m",
    ]);
  });
});
