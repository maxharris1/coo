import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightPlan } from "@/lib/flight/engine";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { delayNotices } from "./delayNotices";

const MINUTE_MS = 60_000;

let deps: TestDeps;
let world: World;
let flightId: string;
let delayStartMs: number;

const step = () => delayNotices({ deps, limit: 50, timeUp: () => false });

async function withDelay(kind: "none" | "minor" | "major") {
  const [{ plan }] = await deps.db.query<{ plan: FlightPlan }>(
    "select plan from flights where id = $1",
    [flightId],
  );
  const start = plan.segments[0].startMs;
  const end = plan.arriveAtMs;
  delayStartMs = start + 10 * MINUTE_MS;
  const delayEndMs = delayStartMs + 20 * MINUTE_MS;
  const segments: FlightPlan["segments"] =
    kind === "none"
      ? [{ kind: "fly", startMs: start, endMs: end, fromFrac: 0, toFrac: 1 }]
      : [
          {
            kind: "fly",
            startMs: start,
            endMs: delayStartMs,
            fromFrac: 0,
            toFrac: 0.3,
          },
          {
            kind: "delay",
            startMs: delayStartMs,
            endMs: delayEndMs,
            fromFrac: 0.3,
            toFrac: 0.3,
          },
          {
            kind: "fly",
            startMs: delayEndMs,
            endMs: end,
            fromFrac: 0.3,
            toFrac: 1,
          },
        ];
  await deps.db.query(
    `update flights set delay_kind = $2, plan = $3,
       place_names = jsonb_set(place_names, '{deciles}', $4::jsonb)
     where id = $1`,
    [
      flightId,
      kind,
      JSON.stringify({
        ...plan,
        delayed: kind !== "none",
        delayKind: kind,
        segments,
      }),
      JSON.stringify([
        "New York, NY",
        "Jersey City, NJ",
        "Newark, NJ",
        "Trenton, NJ",
        null,
        null,
        null,
        null,
        null,
        null,
        "Philadelphia, PA",
      ]),
    ],
  );
}

async function notices() {
  return deps.db.query<{
    user_id: string;
    kind: string;
    ref_id: string;
    title: string;
    body: string;
    url: string;
  }>(
    `select user_id, kind, ref_id, title, body, url from notifications
     where kind in ('delayed', 'delayed-in') order by kind`,
  );
}

async function notified() {
  const [{ delay_notified }] = await deps.db.query<{ delay_notified: boolean }>(
    "select delay_notified from flights where id = $1",
    [flightId],
  );
  return delay_notified;
}

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  ({ flightId } = await insertPlannedDelivery(
    deps.db,
    world,
    deps.clock.now(),
  ));
});

afterEach(() => vi.restoreAllMocks());

describe("delay notices", () => {
  it("notifies the owner and the recipient once a major delay has started", async () => {
    await withDelay("major");
    deps.clock.set(delayStartMs + MINUTE_MS);

    expect(await step()).toEqual({ count: 1 });

    const bird = world.max.birds[0].name;
    expect(await notices()).toEqual([
      {
        user_id: world.max.id,
        kind: "delayed",
        ref_id: flightId,
        title: `${bird} is running late`,
        body: "Last seen near Trenton, NJ. Tap to send a search party.",
        url: `/flights/${flightId}/incident`,
      },
      {
        user_id: world.priya.id,
        kind: "delayed-in",
        ref_id: flightId,
        title: "A bird is on the way, eventually",
        body: `Max's pigeon ${bird} got distracted. The note is still attached. Probably.`,
        url: `/flights/${flightId}`,
      },
    ]);
    expect(await notified()).toBe(true);
  });

  it("adds nothing when run again", async () => {
    await withDelay("major");
    deps.clock.set(delayStartMs + MINUTE_MS);
    await step();
    deps.clock.set(delayStartMs + 2 * MINUTE_MS);

    expect(await step()).toEqual({ count: 0 });
    expect(await notices()).toHaveLength(2);
  });

  it("adds nothing when run twice in parallel", async () => {
    await withDelay("major");
    deps.clock.set(delayStartMs + MINUTE_MS);

    const results = await Promise.all([step(), step()]);

    expect(results.map((r) => r.count).sort()).toEqual([0, 1]);
    expect(await notices()).toHaveLength(2);
    expect(await notified()).toBe(true);
  });

  it("notifies only the owner for a guest delivery", async () => {
    await withDelay("major");
    await deps.db.query(
      "update flights set counterpart_id = null where id = $1",
      [flightId],
    );
    deps.clock.set(delayStartMs + MINUTE_MS);

    expect(await step()).toEqual({ count: 1 });
    expect((await notices()).map((n) => [n.user_id, n.kind])).toEqual([
      [world.max.id, "delayed"],
    ]);
  });

  it("notifies the owner and the counterpart once for a return flight", async () => {
    await withDelay("major");
    await deps.db.query("update flights set kind = 'return' where id = $1", [
      flightId,
    ]);
    deps.clock.set(delayStartMs + MINUTE_MS);

    expect(await step()).toEqual({ count: 1 });
    deps.clock.set(delayStartMs + 2 * MINUTE_MS);
    expect(await step()).toEqual({ count: 0 });

    expect((await notices()).map((n) => [n.user_id, n.kind])).toEqual([
      [world.max.id, "delayed"],
      [world.priya.id, "delayed-in"],
    ]);
    expect(await notified()).toBe(true);
  });

  it("sends a flagged return flight's missing counterpart notice once", async () => {
    await withDelay("major");
    await deps.db.query(
      "update flights set kind = 'return', delay_notified = true where id = $1",
      [flightId],
    );
    deps.clock.set(delayStartMs + MINUTE_MS);

    expect(await step()).toEqual({ count: 1 });
    deps.clock.set(delayStartMs + 2 * MINUTE_MS);
    expect(await step()).toEqual({ count: 0 });

    expect((await notices()).map((n) => [n.user_id, n.kind])).toEqual([
      [world.priya.id, "delayed-in"],
    ]);
  });

  it("waits until the delay segment has started", async () => {
    await withDelay("major");
    deps.clock.set(delayStartMs - MINUTE_MS);

    expect(await step()).toEqual({ count: 0 });
    expect(await notices()).toEqual([]);
    expect(await notified()).toBe(false);
  });

  it.each(["minor", "none"] as const)(
    "sends nothing for a %s delay",
    async (kind) => {
      await withDelay(kind);
      deps.clock.set(delayStartMs + MINUTE_MS);

      expect(await step()).toEqual({ count: 0 });
      expect(await notices()).toEqual([]);
      expect(await notified()).toBe(false);
    },
  );

  it("notifies the other flights and logs the failing flight id when one flight throws", async () => {
    const errorLines = vi.spyOn(console, "error").mockImplementation(() => {});
    const failingId = flightId;
    await withDelay("major");
    ({ flightId } = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
      { birdId: world.max.birds[1].id },
    ));
    await withDelay("major");
    const healthyId = flightId;
    await deps.db.query(
      "update flights set release_at = release_at + interval '1 minute' where id = $1",
      [healthyId],
    );
    vi.spyOn(deps.db, "tx").mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    deps.clock.set(delayStartMs + MINUTE_MS);

    expect(await step()).toEqual({ count: 1, failed: 1 });

    expect((await notices()).map((n) => [n.ref_id, n.kind])).toEqual([
      [healthyId, "delayed"],
      [healthyId, "delayed-in"],
    ]);
    expect(await notified()).toBe(true);
    flightId = failingId;
    expect(await notified()).toBe(false);
    expect(
      errorLines.mock.calls.map(([line]) => JSON.parse(line as string)),
    ).toEqual([
      expect.objectContaining({
        event: "tick.row_failed",
        step: "delayNotices",
        rowId: failingId,
      }),
    ]);
  });
});
