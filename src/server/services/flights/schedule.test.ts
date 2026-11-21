import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { unfriend } from "@/server/services/friends";
import { send } from "./send";

const BODY = "Coffee at seven, my treat";
const HOUR_MS = 60 * 60 * 1000;

let deps: TestDeps;
let world: World;
let max: UserId;
let priya: UserId;
let rosa: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  priya = world.priya.id as UserId;
  rosa = world.rosa.id as UserId;
  gerald = world.max.birds[0].id;
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "resolved";
}

async function snapshot() {
  return {
    birds: await deps.db.query(
      "select id, status, care_at from birds order by id",
    ),
    notes: await deps.db.query("select * from notes order by id"),
    flights: await deps.db.query("select * from flights order by id"),
    notifications: await deps.db.query(
      "select * from notifications order by id",
    ),
  };
}

function schedule(
  releaseAt: number,
  sends: Parameters<typeof send>[2]["sends"] = [
    { friendId: priya, birdId: gerald },
  ],
) {
  return send(deps, max, { body: BODY, sends, releaseAt });
}

describe("schedule", () => {
  it("stores a scheduled flight with endpoints and the note but no plan, and reserves the bird", async () => {
    const releaseAt = deps.clock.now() + 9 * HOUR_MS;

    const { flights } = await schedule(releaseAt);

    expect(flights).toHaveLength(1);
    const [flight] = flights;
    expect(flight).toMatchObject({
      kind: "delivery",
      status: "scheduled",
      releaseAt,
      role: "mine",
      hasNote: true,
      bird: { id: gerald },
      counterpart: { id: priya },
    });
    expect(flight.plan).toBeUndefined();
    expect(flight.input).toBeUndefined();
    expect(flight.arriveAt).toBeUndefined();
    expect(flight.from.label).toEqual(expect.any(String));
    expect(flight.to.label).toEqual(expect.any(String));

    const [row] = await deps.db.query<{
      status: string;
      release_at: Date;
      arrive_at: Date | null;
      plan: unknown;
      input: unknown;
      body: string;
      recipient_id: string;
      delivered_at: Date | null;
    }>(
      `select f.status, f.release_at, f.arrive_at, f.plan, f.input,
         n.body, n.recipient_id, n.delivered_at
       from flights f join notes n on n.id = f.note_id where f.id = $1`,
      [flight.id],
    );
    expect(row).toEqual({
      status: "scheduled",
      release_at: new Date(releaseAt),
      arrive_at: null,
      plan: null,
      input: null,
      body: BODY,
      recipient_id: priya,
      delivered_at: null,
    });

    const [bird] = await deps.db.query<{ status: string }>(
      "select status from birds where id = $1",
      [gerald],
    );
    expect(bird.status).toBe("scheduled");
  });

  it("accepts a time exactly 24 hours ahead", async () => {
    const releaseAt = deps.clock.now() + 24 * HOUR_MS;
    const { flights } = await schedule(releaseAt);
    expect(flights[0]).toMatchObject({ status: "scheduled", releaseAt });
  });

  it("tells the recipient nothing until the bird is released", async () => {
    const before = await snapshot();
    await schedule(deps.clock.now() + HOUR_MS);
    expect((await snapshot()).notifications).toEqual(before.notifications);
  });

  it("refuses the same bird twice as conflict and keeps one flight", async () => {
    await schedule(deps.clock.now() + HOUR_MS);
    const after = await snapshot();
    expect(await refusal(schedule(deps.clock.now() + 2 * HOUR_MS))).toBe(
      "conflict",
    );
    expect(await snapshot()).toEqual(after);
  });

  it("refuses someone else's bird as not_found and changes nothing", async () => {
    const before = await snapshot();
    const theirs = world.priya.birds[0].id;
    expect(
      await refusal(
        schedule(deps.clock.now() + HOUR_MS, [
          { friendId: priya, birdId: theirs },
        ]),
      ),
    ).toBe("not_found");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a non-friend as forbidden and changes nothing", async () => {
    await unfriend(deps, max, rosa);
    const before = await snapshot();
    expect(
      await refusal(
        schedule(deps.clock.now() + HOUR_MS, [
          { friendId: rosa, birdId: gerald },
        ]),
      ),
    ).toBe("forbidden");
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ["more than 24 hours ahead", 24 * HOUR_MS + 1],
    ["in the past", -1],
    ["right now", 0],
  ])("refuses a time %s as invalid and changes nothing", async (_, offset) => {
    const before = await snapshot();
    expect(await refusal(schedule(deps.clock.now() + offset))).toBe("invalid");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses an empty note as invalid and changes nothing", async () => {
    const before = await snapshot();
    expect(
      await refusal(
        send(deps, max, {
          body: "   ",
          sends: [{ friendId: priya, birdId: gerald }],
          releaseAt: deps.clock.now() + HOUR_MS,
        }),
      ),
    ).toBe("invalid");
    expect(await snapshot()).toEqual(before);
  });
});
