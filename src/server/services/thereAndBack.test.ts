import { beforeEach, describe, expect, it } from "vitest";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { send } from "./flights/send";
import { listNotes } from "./notes";
import { sync } from "./sync";
import { tick } from "./tick";
import { replyToVisit } from "./visits/reply";

const MINUTE_MS = 60_000;
const NOTE = "Bring the good bagels on Sunday";
const REPLY = "Only if you bring the cream cheese";

let deps: TestDeps;
let world: World;
let max: UserId;
let priya: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  priya = world.priya.id as UserId;
  gerald = world.max.birds[0].id;
});

async function rows<T>(sql: string, params: unknown[] = []) {
  return deps.db.query<T>(sql, params);
}

async function callerFor(id: string): Promise<OnboardedCaller> {
  const [profile] = await rows<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [id],
  );
  return { userId: id as UserId, profile };
}

async function seedsOf(id: string) {
  const [{ seeds }] = await rows<{ seeds: number }>(
    "select seeds from profiles where id = $1",
    [id],
  );
  return seeds;
}

function notificationCounts() {
  return rows<{ user_id: string; kind: string; count: number }>(
    `select user_id, kind, count(*)::int as count from notifications
     group by user_id, kind order by kind`,
  );
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
  "found_objects",
  "notifications",
  "events",
];

async function snapshot() {
  const out: Record<string, unknown[]> = {};
  for (const table of SNAPSHOT_TABLES)
    out[table] = await rows(`select * from ${table} order by 1, 2`);
  return out;
}

describe("scenario 1: there and back", () => {
  it("Gerald flies to Priya, waits for her reply, and brings it home", async () => {
    const seedsAtStart = await seedsOf(max);
    const {
      flights: [out],
    } = await send(deps, max, {
      body: NOTE,
      sends: [{ friendId: priya, birdId: gerald }],
    });
    const [{ arrive_at: deliveryArrival }] = await rows<{ arrive_at: Date }>(
      "select arrive_at from flights where id = $1",
      [out.id],
    );

    deps.clock.set(deliveryArrival.getTime() - MINUTE_MS);
    const before = await sync(deps, await callerFor(priya), null);
    expect(before.flights.map((f) => f.id)).toContain(out.id);
    expect(JSON.stringify(before)).not.toContain(NOTE);

    deps.clock.set(deliveryArrival.getTime() + MINUTE_MS);
    expect((await tick(deps)).counts.landDeliveries).toBe(1);

    const [visit] = await rows<{ id: string; status: string }>(
      "select id, status from visits where flight_id = $1",
      [out.id],
    );
    expect(visit.status).toBe("waiting");
    expect(
      await rows(
        "select reason, delta from seed_ledger where user_id = $1 and ref_id = $2 order by reason",
        [max, out.id],
      ),
    ).toEqual([
      { reason: "delivery", delta: 13 },
      { reason: "new_city", delta: 25 },
    ]);
    const seedsAfterDelivery = await seedsOf(max);
    expect(seedsAfterDelivery).toBe(seedsAtStart + 38);
    expect(await notificationCounts()).toEqual([
      { user_id: priya, kind: "incoming", count: 1 },
      { user_id: priya, kind: "landed-in", count: 1 },
      { user_id: max, kind: "landed-out", count: 1 },
    ]);

    const landed = await snapshot();
    await tick(deps);
    expect(await snapshot()).toEqual(landed);

    const { flight: back } = await replyToVisit(
      deps,
      await callerFor(priya),
      visit.id,
      REPLY,
    );
    expect(back.kind).toBe("return");
    const [{ arrive_at: returnArrival }] = await rows<{ arrive_at: Date }>(
      "select arrive_at from flights where id = $1",
      [back.id],
    );

    deps.clock.set(returnArrival.getTime() + MINUTE_MS);
    expect((await tick(deps)).counts.landReturns).toBe(1);

    const [bird] = await rows<{ status: string }>(
      "select status from birds where id = $1",
      [gerald],
    );
    expect(bird.status).toBe("home");

    const shoebox = await listNotes(deps, max, { friendId: priya });
    expect(shoebox.notes.map((n) => n.body)).toContain(REPLY);

    expect(await seedsOf(max)).toBe(seedsAfterDelivery + 5);
    expect(
      await rows("select reason, delta from seed_ledger where ref_id = $1", [
        back.id,
      ]),
    ).toEqual([{ reason: "reply_home", delta: 5 }]);
    expect(await notificationCounts()).toEqual([
      { user_id: priya, kind: "incoming", count: 1 },
      { user_id: priya, kind: "landed-in", count: 1 },
      { user_id: max, kind: "landed-out", count: 1 },
      { user_id: priya, kind: "reply-delivered", count: 1 },
      { user_id: max, kind: "reply-home", count: 1 },
    ]);

    const home = await snapshot();
    await tick(deps);
    expect(await snapshot()).toEqual(home);
  });
});
