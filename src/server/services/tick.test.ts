import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import type { recordNotification } from "./notify";
import { tick, type Step } from "./tick";
import type { guestLanding } from "./tick/guestLanding";

const spies = vi.hoisted(() => ({
  landReturns: vi.fn<Step>(async () => ({ count: 0 })),
  finishJobs: vi.fn<Step>(async () => ({ count: 0 })),
  guestLanding: vi.fn<typeof guestLanding>(async () => {}),
  failingRef: { id: null as string | null },
}));

vi.mock("./tick/landReturns", () => ({ landReturns: spies.landReturns }));
vi.mock("./tick/finishJobs", () => ({ finishJobs: spies.finishJobs }));
vi.mock("./tick/guestLanding", () => ({ guestLanding: spies.guestLanding }));
vi.mock("./notify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notify")>();
  return {
    ...actual,
    recordNotification: (async (tx, nowMs, row) => {
      if (row.refId === spies.failingRef.id)
        throw new Error(`notification failed for ${row.refId}`);
      return actual.recordNotification(tx, nowMs, row);
    }) satisfies typeof recordNotification,
  };
});

const STEP_ORDER = [
  "scheduleReleases",
  "landDeliveries",
  "endVisits",
  "landReturns",
  "delayNotices",
  "roostNotices",
  "finishJobs",
  "wakeBirds",
  "hungryNotices",
  "expireGuestLinks",
  "flushQuietHours",
];

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  vi.clearAllMocks();
  spies.landReturns.mockImplementation(async () => ({ count: 0 }));
  spies.failingRef.id = null;
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

afterEach(() => vi.restoreAllMocks());

function captureErrors() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return () =>
    spy.mock.calls.map(([line]) => JSON.parse(line as string) as unknown);
}

async function seedDueDeliveries(n: number): Promise<string[]> {
  const nowMs = deps.clock.now();
  const birdIds = await deps.db.query<{ id: string }>(
    `insert into birds (owner_id, name, speed_mph, focus, navigation, care_at, last_fed_at, hatched_at)
     select $1, 'Bird ' || i, 40, 3, 3, $2, $2, $2 from generate_series(1, $3) as i
     returning id`,
    [world.max.id, new Date(nowMs).toISOString(), n],
  );
  const ids: string[] = [];
  let latestArrival = nowMs;
  for (const { id } of birdIds) {
    const f = await insertPlannedDelivery(deps.db, world, nowMs, {
      birdId: id,
    });
    ids.push(f.flightId);
    latestArrival = Math.max(latestArrival, f.arriveAtMs);
  }
  deps.clock.set(latestArrival + 60_000);
  return ids;
}

async function flightStatus(ids: string[]) {
  const found = await deps.db.query<{ id: string; status: string }>(
    "select id, status from flights where id = any($1::uuid[])",
    [ids],
  );
  return Object.fromEntries(found.map((r) => [r.id, r.status]));
}

describe("tick", () => {
  it("runs all eleven steps in docs/06 order with zero counts when nothing is due", async () => {
    const result = await tick(deps);

    expect(result.timedOut).toBe(false);
    expect(Object.keys(result.counts)).toEqual(STEP_ORDER);
    expect(Object.values(result.counts)).toEqual(STEP_ORDER.map(() => 0));
  });

  it("returns zero counts when scoped to one user", async () => {
    const result = await tick(deps, { userId: world.max.id });

    expect(result).toEqual({
      counts: Object.fromEntries(STEP_ORDER.map((s) => [s, 0])),
      failed: {},
      ms: 0,
      timedOut: false,
    });
  });

  it("stops before later steps once a looping step passes the 20 second budget", async () => {
    spies.landReturns.mockImplementation(async (ctx) => {
      let count = 0;
      for (let i = 0; i < 3; i++) {
        deps.clock.advance(7_000);
        await Promise.resolve();
        count++;
        if (ctx.timeUp()) break;
      }
      return { count };
    });

    const result = await tick(deps);

    expect(result.timedOut).toBe(true);
    expect(result.counts).toEqual({
      scheduleReleases: 0,
      landDeliveries: 0,
      endVisits: 0,
      landReturns: 3,
    });
    expect(spies.finishJobs).not.toHaveBeenCalled();
  });

  it("passes the caller's id and the row limit to each step", async () => {
    await tick(deps, { userId: world.max.id });

    expect(spies.landReturns).toHaveBeenCalledWith(
      expect.objectContaining({ userId: world.max.id, limit: 50, deps }),
    );
  });

  it("calls the guest landing hook from land deliveries", async () => {
    await tick(deps);

    expect(spies.guestLanding).toHaveBeenCalledTimes(1);
    expect(spies.guestLanding).toHaveBeenCalledWith(expect.anything(), []);
  });

  it("reports the time the tick took on the clock", async () => {
    spies.landReturns.mockImplementation(async () => {
      deps.clock.advance(7_000);
      return { count: 0 };
    });

    const result = await tick(deps);

    expect(result.ms).toBe(7_000);
  });

  it("lands 120 due deliveries as 50, 50 and 20 over three ticks, none twice", async () => {
    const ids = await seedDueDeliveries(120);

    const landed: (number | undefined)[] = [];
    for (let i = 0; i < 4; i++)
      landed.push((await tick(deps)).counts.landDeliveries);

    expect(landed).toEqual([50, 50, 20, 0]);
    expect(Object.values(await flightStatus(ids))).toEqual(
      ids.map(() => "landed"),
    );
    const [once] = await deps.db.query<Record<string, number>>(
      `select
         (select count(*)::int from notifications where kind = 'landed-out' and ref_id = any($1::uuid[])) as notices,
         (select count(distinct ref_id)::int from notifications where kind = 'landed-out' and ref_id = any($1::uuid[])) as noticed_flights,
         (select count(*)::int from seed_ledger where reason = 'delivery' and ref_id = any($1::uuid[])) as pay,
         (select count(*)::int from visits where flight_id = any($1::uuid[])) as visits`,
      [ids],
    );
    expect(once).toEqual({
      notices: 120,
      noticed_flights: 120,
      pay: 120,
      visits: 120,
    });
  }, 60_000);

  it("lands the other rows when one row throws, logs its id and retries it next tick", async () => {
    const errors = captureErrors();
    const ids = await seedDueDeliveries(3);
    const bad = ids[1];
    spies.failingRef.id = bad;

    const result = await tick(deps);

    expect(result.counts.landDeliveries).toBe(2);
    expect(result.failed).toEqual({ landDeliveries: 1 });
    expect(Object.keys(result.counts)).toEqual(STEP_ORDER);
    expect(await flightStatus(ids)).toEqual({
      [ids[0]]: "landed",
      [bad]: "flying",
      [ids[2]]: "landed",
    });
    expect(errors()).toEqual([
      expect.objectContaining({
        level: "error",
        event: "tick.row_failed",
        step: "landDeliveries",
        rowId: bad,
      }),
    ]);

    spies.failingRef.id = null;
    const retry = await tick(deps);

    expect(retry.counts.landDeliveries).toBe(1);
    expect(retry.failed).toEqual({});
    expect((await flightStatus(ids))[bad]).toBe("landed");
  });

  it("runs the later steps when one step throws, and logs the step", async () => {
    const errors = captureErrors();
    spies.landReturns.mockImplementation(async () => {
      throw new Error("landReturns broke");
    });

    const result = await tick(deps);

    expect(result.timedOut).toBe(false);
    expect(result.failed).toEqual({ landReturns: 1 });
    expect(Object.keys(result.counts)).toEqual(
      STEP_ORDER.filter((s) => s !== "landReturns"),
    );
    expect(spies.finishJobs).toHaveBeenCalledTimes(1);
    expect(errors()).toEqual([
      expect.objectContaining({
        level: "error",
        event: "tick.step_failed",
        step: "landReturns",
        error: { name: "Error", message: "landReturns broke" },
      }),
    ]);
  });
});
