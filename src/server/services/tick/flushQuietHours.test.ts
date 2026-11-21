import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { notify } from "../notify";
import { tick } from "../tick";
import { flushQuietHours } from "./flushQuietHours";

const HOUR_MS = 3_600_000;
const NOON_NY = Date.UTC(2026, 10, 19, 17);
const ELEVEN_PM_NY = Date.UTC(2026, 10, 20, 4);
const TWO_AM_NY = Date.UTC(2026, 10, 20, 7);
const SEVEN_AM_NY = Date.UTC(2026, 10, 20, 12);

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  deps.clock.set(NOON_NY);
  world = await seedWorld(deps.db, deps.clock.now());
});

async function subscribe(person: Person, name = "phone") {
  const endpoint = `https://push.example/${person.handle}/${name}`;
  await deps.db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')",
    [person.id, endpoint],
  );
  return endpoint;
}

async function hold(person: Person, at: number, kind = "landed-in") {
  deps.clock.set(at);
  const refId = crypto.randomUUID();
  const { id } = (await notify(deps, {
    userId: person.id,
    kind,
    refId,
    title: "Gerald has landed",
    body: "There is a note on your sill.",
    url: `/sill/${refId}`,
  }))!;
  return { id, tag: `${kind}:${refId}` };
}

async function pushSentAt(id: string) {
  const [row] = await deps.db.query<{ push_sent_at: Date | null }>(
    "select push_sent_at from notifications where id = $1",
    [id],
  );
  return row.push_sent_at;
}

async function flushAt(at: number, userId?: string) {
  deps.clock.set(at);
  return (await tick(deps, { userId })).counts.flushQuietHours;
}

describe("tick step 11: flush quiet hours", () => {
  it("holds the push while quiet hours last", async () => {
    await subscribe(world.priya);
    const held = await hold(world.priya, ELEVEN_PM_NY);

    expect(await flushAt(TWO_AM_NY)).toBe(0);
    expect(deps.push.sent).toEqual([]);
    expect(await pushSentAt(held.id)).toBeNull();
  });

  it("pushes a held notification once after quiet hours end", async () => {
    const phone = await subscribe(world.priya, "a-phone");
    const tablet = await subscribe(world.priya, "b-tablet");
    const held = await hold(world.priya, ELEVEN_PM_NY);

    expect(await flushAt(SEVEN_AM_NY)).toBe(1);

    expect(deps.push.sent.map((s) => [s.sub.endpoint, s.payload.tag])).toEqual([
      [phone, held.tag],
      [tablet, held.tag],
    ]);
    expect(await pushSentAt(held.id)).toEqual(new Date(SEVEN_AM_NY));
  });

  it("a second tick pushes nothing more", async () => {
    await subscribe(world.priya);
    await hold(world.priya, ELEVEN_PM_NY);

    expect(await flushAt(SEVEN_AM_NY)).toBe(1);
    expect(await flushAt(SEVEN_AM_NY + HOUR_MS)).toBe(0);
    expect(deps.push.sent).toHaveLength(1);
  });

  it("does not push a held notification read in the app before quiet hours end", async () => {
    await subscribe(world.priya);
    const held = await hold(world.priya, ELEVEN_PM_NY);
    await deps.db.query("update notifications set read_at = $2 where id = $1", [
      held.id,
      new Date(TWO_AM_NY).toISOString(),
    ]);

    expect(await flushAt(SEVEN_AM_NY)).toBe(0);
    expect(deps.push.sent).toEqual([]);
    expect(await pushSentAt(held.id)).toBeNull();
  });

  it("never flushes a row skipped for lack of a subscription outside quiet hours", async () => {
    const skipped = await hold(world.priya, NOON_NY);
    await subscribe(world.priya);

    expect(await flushAt(NOON_NY + HOUR_MS)).toBe(0);
    expect(await flushAt(SEVEN_AM_NY)).toBe(0);
    expect(deps.push.sent).toEqual([]);
    expect(await pushSentAt(skipped.id)).toBeNull();
  });

  it("does not flush a kind switched off in settings", async () => {
    await subscribe(world.priya);
    await hold(world.priya, ELEVEN_PM_NY);
    await deps.db.query(
      "update profiles set notify_landed_in = false where id = $1",
      [world.priya.id],
    );

    expect(await flushAt(SEVEN_AM_NY)).toBe(0);
    expect(deps.push.sent).toEqual([]);
  });

  it("does not flush a row held more than a day ago", async () => {
    await subscribe(world.priya);
    await hold(world.priya, ELEVEN_PM_NY);

    expect(await flushAt(ELEVEN_PM_NY + 25 * HOUR_MS)).toBe(0);
    expect(deps.push.sent).toEqual([]);
  });

  it("follows the recipient's own time zone", async () => {
    await subscribe(world.priya);
    await deps.db.query(
      "update profiles set timezone = 'America/Los_Angeles' where id = $1",
      [world.priya.id],
    );
    await hold(world.priya, ELEVEN_PM_NY + 3 * HOUR_MS);

    expect(await flushAt(SEVEN_AM_NY)).toBe(0);
    expect(await flushAt(SEVEN_AM_NY + 3 * HOUR_MS)).toBe(1);
  });

  it("a tick scoped to one user flushes only that user's rows", async () => {
    await subscribe(world.priya);
    const rosaPhone = await subscribe(world.rosa);
    await hold(world.priya, ELEVEN_PM_NY);
    const rosas = await hold(world.rosa, ELEVEN_PM_NY);

    expect(await flushAt(SEVEN_AM_NY, world.rosa.id)).toBe(1);
    expect(deps.push.sent.map((s) => s.sub.endpoint)).toEqual([rosaPhone]);
    expect(await pushSentAt(rosas.id)).toEqual(new Date(SEVEN_AM_NY));
  });

  it("rows it will never flush do not use up the row limit", async () => {
    await subscribe(world.priya);
    await deps.db.query(
      "update profiles set notify_landed_in = false where id = $1",
      [world.priya.id],
    );
    await hold(world.priya, NOON_NY);
    const held = await hold(world.priya, ELEVEN_PM_NY, "hatched");
    deps.clock.set(SEVEN_AM_NY);

    const { count } = await flushQuietHours({
      deps,
      limit: 1,
      timeUp: () => false,
    });

    expect(count).toBe(1);
    expect(deps.push.sent.map((s) => s.payload.tag)).toEqual([held.tag]);
  });
});
