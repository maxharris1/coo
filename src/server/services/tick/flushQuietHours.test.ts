import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settingsPatch } from "@/app/api/settings/patch";
import { syncGet } from "@/app/api/sync/get";
import { toE164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { notify } from "../notify";
import { tick } from "../tick";
import { flushQuietHours } from "./flushQuietHours";

const HOUR_MS = 3_600_000;
const NOON_NY = Date.UTC(2026, 10, 19, 17);
const ELEVEN_PM_NY = Date.UTC(2026, 10, 20, 4);
const TWO_AM_NY = Date.UTC(2026, 10, 20, 7);
const SEVEN_AM_NY = Date.UTC(2026, 10, 20, 12);
const NINE_AM_NY = Date.UTC(2026, 10, 20, 14);
const SEVEN_AM_TOKYO = Date.UTC(2026, 10, 19, 22);

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  deps.clock.set(NOON_NY);
  world = await seedWorld(deps.db, deps.clock.now());
});

afterEach(() => vi.restoreAllMocks());

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

async function signIn(person: Person, phone: string) {
  const jar = new FakeJar();
  const e164 = toE164(phone);
  if (!e164) throw new Error("invalid fixture phone");
  expect(await deps.auth(jar).verifyCode(e164, "000000")).toBe(person.id);
  return jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
}

async function patchSettings(cookie: string, body: Record<string, unknown>) {
  const response = await settingsPatch(createJsonRoute(async () => deps))(
    new NextRequest("https://coo.test/api/settings", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(200);
}

async function syncTimezone(person: Person, phone: string, timezone: string) {
  const cookie = await signIn(person, phone);
  const response = await syncGet(createJsonRoute(async () => deps))(
    new NextRequest("https://coo.test/api/sync", {
      headers: { cookie, "x-timezone": timezone },
    }),
  );
  expect(response.status).toBe(200);
  const [profile] = await deps.db.query<{ timezone: string }>(
    "select timezone from profiles where id = $1",
    [person.id],
  );
  expect(profile.timezone).toBe(timezone);
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

  it("pushes the later rows and logs the failing row id when one row throws", async () => {
    const errorLines = vi.spyOn(console, "error").mockImplementation(() => {});
    await subscribe(world.priya);
    const first = await hold(world.priya, ELEVEN_PM_NY);
    const middle = await hold(world.priya, ELEVEN_PM_NY + 60_000);
    const last = await hold(world.priya, ELEVEN_PM_NY + 120_000);
    const query = deps.db.query.bind(deps.db);
    const failing = vi
      .spyOn(deps.db, "query")
      .mockImplementation((sql, params) =>
        sql.startsWith("select user_id, read_at, push_sent_at") &&
        params?.[0] === middle.id
          ? query("select 1 / 0")
          : query(sql, params),
      );
    deps.clock.set(SEVEN_AM_NY);

    const result = await tick(deps);

    expect(result.counts.flushQuietHours).toBe(2);
    expect(result.failed).toEqual({ flushQuietHours: 1 });
    expect(deps.push.sent.map((s) => s.payload.tag)).toEqual([
      first.tag,
      last.tag,
    ]);
    expect(await pushSentAt(middle.id)).toBeNull();
    expect(
      errorLines.mock.calls.map(([line]) => JSON.parse(line as string)),
    ).toEqual([
      expect.objectContaining({
        event: "tick.row_failed",
        step: "flushQuietHours",
        rowId: middle.id,
      }),
    ]);

    failing.mockRestore();
    expect(await flushAt(SEVEN_AM_NY + HOUR_MS)).toBe(1);
    expect(deps.push.sent.map((s) => s.payload.tag)).toEqual([
      first.tag,
      last.tag,
      middle.tag,
    ]);
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

  describe("when PATCH /api/settings changes quiet hours while a push is held", () => {
    it("keeps a 23:00 hold quiet until a quiet end moved from 07:00 to 09:00", async () => {
      await subscribe(world.priya);
      const held = await hold(world.priya, ELEVEN_PM_NY);
      await patchSettings(await signIn(world.priya, "+15550000002"), {
        quietEnd: 9,
      });

      expect(await flushAt(SEVEN_AM_NY)).toBe(0);
      expect(await flushAt(NINE_AM_NY - 1)).toBe(0);
      expect(deps.push.sent).toEqual([]);
      expect(await flushAt(NINE_AM_NY)).toBe(1);
      expect(deps.push.sent.map((s) => s.payload.tag)).toEqual([held.tag]);
      expect(await pushSentAt(held.id)).toEqual(new Date(NINE_AM_NY));
    });

    it("releases the hold at 06:00 when the quiet end moves from 07:00 to 06:00", async () => {
      await subscribe(world.priya);
      await hold(world.priya, ELEVEN_PM_NY);
      await patchSettings(await signIn(world.priya, "+15550000002"), {
        quietEnd: 6,
      });

      expect(await flushAt(SEVEN_AM_NY - HOUR_MS - 1)).toBe(0);
      expect(await flushAt(SEVEN_AM_NY - HOUR_MS)).toBe(1);
    });

    it("releases the hold on the next tick when quiet hours are switched off", async () => {
      await subscribe(world.priya);
      await hold(world.priya, ELEVEN_PM_NY);
      deps.clock.set(TWO_AM_NY);
      await patchSettings(await signIn(world.priya, "+15550000002"), {
        quietOn: false,
      });

      expect(await flushAt(TWO_AM_NY)).toBe(1);
    });

    it("leaves a daytime no-subscription skip unflushed", async () => {
      const skipped = await hold(world.priya, NOON_NY);
      await subscribe(world.priya);
      await patchSettings(await signIn(world.priya, "+15550000002"), {
        quietEnd: 9,
      });

      expect(await flushAt(NINE_AM_NY)).toBe(0);
      expect(await pushSentAt(skipped.id)).toBeNull();
    });
  });

  describe("when GET /api/sync changes the time zone after the decision", () => {
    it("never flushes a daytime no-subscription skip", async () => {
      const skipped = await hold(world.priya, NOON_NY);
      await syncTimezone(world.priya, "+15550000002", "Asia/Tokyo");
      await subscribe(world.priya);

      expect(await flushAt(SEVEN_AM_TOKYO, world.priya.id)).toBe(0);
      expect(deps.push.sent).toEqual([]);
      expect(await pushSentAt(skipped.id)).toBeNull();
    });

    it("releases a 23:00 New York hold at 07:00 New York", async () => {
      await subscribe(world.priya);
      const held = await hold(world.priya, ELEVEN_PM_NY);
      await syncTimezone(world.priya, "+15550000002", "Asia/Tokyo");

      expect(await flushAt(SEVEN_AM_NY, world.priya.id)).toBe(1);
      expect(deps.push.sent.map((s) => s.payload.tag)).toEqual([held.tag]);
      expect(await pushSentAt(held.id)).toEqual(new Date(SEVEN_AM_NY));
    });

    it("keeps the release instant decided at hold time", async () => {
      await subscribe(world.priya);
      const held = await hold(world.priya, ELEVEN_PM_NY);
      await syncTimezone(world.priya, "+15550000002", "America/Los_Angeles");

      expect(await flushAt(SEVEN_AM_NY - 1)).toBe(0);
      expect(await flushAt(SEVEN_AM_NY)).toBe(1);
      expect(await pushSentAt(held.id)).toEqual(new Date(SEVEN_AM_NY));
    });
  });
});
