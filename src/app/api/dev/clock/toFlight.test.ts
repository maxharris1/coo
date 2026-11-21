import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { devClockRoute } from "@/test/devClockRoute";
import { addDelivery, HOUR_MS } from "@/test/fixtures/flights";
import { addNote } from "@/test/fixtures/notes";
import { geoClient } from "@/test/geoRoute";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { devClockPost } from "./post";

const PHONE = { max: "+15550000001", rosa: "+15550000003" };

let deps: TestDeps;
let world: World;
let now: number;
let clock: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  await deps.db.query("update dev_clock set offset_ms = 0");
  now = deps.clock.now();
  world = await seedWorld(deps.db, now);
  clock = geoClient(deps, devClockPost, "/api/dev/clock", devClockRoute(deps));
});

const ref = () => crypto.randomUUID();

async function jarOf(who: keyof typeof PHONE) {
  return (await clock.signIn(PHONE[who])).jar;
}

async function flight(from: Person, to: Person, arriveMs: number) {
  const { flightId } = await insertPlannedDelivery(deps.db, world, now, {
    from,
    to,
  });
  await deps.db.query("update flights set arrive_at = $2 where id = $1", [
    flightId,
    new Date(arriveMs).toISOString(),
  ]);
  return flightId;
}

function landed(from: Person, to: Person) {
  return deps.db.tx(async (t) => {
    const noteId = await addNote(t, from, to, now, false);
    return addDelivery(
      t,
      from,
      to,
      from.birds[0].id,
      noteId,
      "landed",
      now - 2 * HOUR_MS,
      now - HOUR_MS,
    );
  });
}

async function statusOf(id: string) {
  const [row] = await deps.db.query<{ status: string }>(
    "select status from flights where id = $1",
    [id],
  );
  return row.status;
}

async function offset() {
  const [{ offset_ms }] = await deps.db.query<{ offset_ms: number }>(
    "select offset_ms from dev_clock",
  );
  return offset_ms;
}

describe("POST /api/dev/clock { toFlight }", () => {
  it("jumps one second past the earlier flight and lands only it", async () => {
    const earlierAt = now + HOUR_MS;
    const earlier = await flight(world.max, world.priya, earlierAt);
    const later = await flight(world.priya, world.max, earlierAt + HOUR_MS / 2);
    const { status, json } = await clock.post(
      { toFlight: earlier, ref: ref() },
      await jarOf("max"),
    );
    expect(status).toBe(200);
    expect(json.serverNow).toBe(earlierAt + 1000);
    expect(json.offsetMs).toBe(HOUR_MS + 1000);
    expect(json.counts.landDeliveries).toBe(1);
    expect(await statusOf(earlier)).toBe("landed");
    expect(await statusOf(later)).toBe("flying");
  });

  it("jumps to a flight the caller receives", async () => {
    const arriveAt = now + 2 * HOUR_MS;
    const incoming = await flight(world.priya, world.max, arriveAt);
    const { json } = await clock.post(
      { toFlight: incoming, ref: ref() },
      await jarOf("max"),
    );
    expect(json.serverNow).toBe(arriveAt + 1000);
    expect(await statusOf(incoming)).toBe("landed");
  });

  it("adds to an offset already set", async () => {
    const jar = await jarOf("max");
    await clock.post({ addMs: HOUR_MS / 4, ref: ref() }, jar);
    const arriveAt = now + HOUR_MS;
    const id = await flight(world.max, world.priya, arriveAt);
    const { json } = await clock.post({ toFlight: id, ref: ref() }, jar);
    expect(json.serverNow).toBe(arriveAt + 1000);
    expect(await offset()).toBe(HOUR_MS + 1000);
  });

  it("never moves the clock back for an overdue flight", async () => {
    const jar = await jarOf("max");
    await clock.post({ addMs: 2 * HOUR_MS, ref: ref() }, jar);
    const id = await flight(world.max, world.priya, now + HOUR_MS);
    const { status, json } = await clock.post(
      { toFlight: id, ref: ref() },
      jar,
    );
    expect(status).toBe(200);
    expect(json.serverNow).toBe(now + 2 * HOUR_MS);
    expect(await statusOf(id)).toBe("landed");
  });

  it("applies a retried ref once", async () => {
    const jar = await jarOf("max");
    const arriveAt = now + HOUR_MS;
    const id = await flight(world.max, world.priya, arriveAt);
    const body = { toFlight: id, ref: ref() };
    expect((await clock.post(body, jar)).status).toBe(200);
    const retry = await clock.post(body, jar);
    expect(retry.status).toBe(200);
    expect(retry.json.serverNow).toBe(arriveAt + 1000);
    expect(await offset()).toBe(HOUR_MS + 1000);
  });

  it("refuses another user's flight as not_found", async () => {
    const theirs = await flight(world.rosa, world.priya, now + HOUR_MS);
    const { status, json } = await clock.post(
      { toFlight: theirs, ref: ref() },
      await jarOf("max"),
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await offset()).toBe(0);
    expect(await statusOf(theirs)).toBe("flying");
  });

  it("refuses a retried ref replayed by another user as not_found", async () => {
    const mine = await flight(world.max, world.priya, now + HOUR_MS);
    const body = { toFlight: mine, ref: ref() };
    await clock.post(body, await jarOf("max"));
    const { status, json } = await clock.post(body, await jarOf("rosa"));
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it.each([
    ["a landed flight", "landed"],
    ["an unknown flight", "unknown"],
  ] as const)("refuses %s as not_found", async (_, kind) => {
    const id =
      kind === "unknown"
        ? crypto.randomUUID()
        : await landed(world.max, world.priya);
    const { status, json } = await clock.post(
      { toFlight: id, ref: ref() },
      await jarOf("max"),
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await offset()).toBe(0);
  });

  it.each([
    ["a non-uuid flight", { toFlight: "abc", ref: ref() }],
    ["toFlight without a ref", { toFlight: crypto.randomUUID() }],
    [
      "toFlight with addMs",
      { toFlight: crypto.randomUUID(), addMs: HOUR_MS, ref: ref() },
    ],
  ])("answers %s with 400 invalid", async (_, body) => {
    const { status, json } = await clock.post(body, await jarOf("max"));
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });
});
