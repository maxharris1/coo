import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { toE164 } from "@/lib/phone";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import {
  insertPlannedDelivery,
  type PlannedDelivery,
} from "@/test/fixtures/plannedFlight";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { notify } from "../notify";
import { tick } from "../tick";
import { deliver } from "./deliver";
import type { Db } from "@/server/db";
import { SMS_UNSUBSCRIBED, SmsError } from "@/server/ports/sms";
import { smsText } from "./smsFallback";

const MINUTE_MS = 60_000;
const NOON_NY = Date.UTC(2026, 10, 19, 17);
const STOP = config.app.sms.stopLine;

let deps: TestDeps;
let world: World;
let flight: PlannedDelivery;

beforeEach(async () => {
  deps = await makeTestDeps();
  deps.clock.set(NOON_NY);
  world = await seedWorld(deps.db, deps.clock.now());
  flight = await insertPlannedDelivery(deps.db, world, deps.clock.now());
});

async function land() {
  deps.clock.set(flight.arriveAtMs + 5 * MINUTE_MS);
  await tick(deps);
}

async function phoneOf(person: Person) {
  const [{ phone }] = await deps.db.query<{ phone: string }>(
    "select phone from auth.users where id = $1",
    [person.id],
  );
  return toE164(phone);
}

async function smsFallbackOf(person: Person) {
  const [{ sms_fallback }] = await deps.db.query<{ sms_fallback: boolean }>(
    "select sms_fallback from profiles where id = $1",
    [person.id],
  );
  return sms_fallback;
}

async function landedIns() {
  return deps.db.query<{ id: string; sms_sent_at: Date | null }>(
    "select id, sms_sent_at from notifications where kind = 'landed-in' and user_id = $1 order by sms_sent_at nulls last",
    [world.priya.id],
  );
}

async function landedIn() {
  const [row] = await deps.db.query<{ id: string; sms_sent_at: Date | null }>(
    "select id, sms_sent_at from notifications where kind = 'landed-in' and user_id = $1",
    [world.priya.id],
  );
  return row;
}

function portCalls() {
  const calls: number[] = [];
  const send = deps.sms.send.bind(deps.sms);
  deps.sms.send = (to, body) => {
    calls.push(deps.clock.now());
    return send(to, body);
  };
  return calls;
}

function onProfileLock(db: Db, after: () => Promise<void> | void): Db {
  const wrap = (inner: Db): Db => ({
    async query<T>(sql: string, params?: unknown[]) {
      const rows = await inner.query<T>(sql, params);
      if (/from profiles[\s\S]*for update/.test(sql)) await after();
      return rows;
    },
    tx: (fn) => inner.tx((t) => fn(wrap(t))),
  });
  return wrap(db);
}

async function subscribe(person: Person) {
  await deps.db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'p', 'a')",
    [person.id, `https://push.example/${person.handle}`],
  );
}

describe("SMS fallback", () => {
  it("a recipient with no push gets one short landed-in text ending with the stop line", async () => {
    await land();

    expect(deps.sms.sent).toHaveLength(1);
    const [text] = deps.sms.sent;
    expect(text.to).toBe(await phoneOf(world.priya));
    expect(text.body.length).toBeLessThan(160);
    expect(text.body.endsWith(STOP)).toBe(true);
    expect(text.body).toContain(world.max.name);
    const row = await landedIn();
    expect(text.body).toContain(`${config.app.domain}/sill/`);
    expect(row.sms_sent_at).toEqual(new Date(deps.clock.now()));
  });

  it("no text carries the note body", async () => {
    await land();

    const [{ body }] = await deps.db.query<{ body: string }>(
      "select body from notes where id = $1",
      [flight.noteId],
    );
    expect(deps.sms.sent).not.toHaveLength(0);
    for (const text of deps.sms.sent) expect(text.body).not.toContain(body);
  });

  it("a recipient with a working push gets no text", async () => {
    await subscribe(world.priya);

    await land();

    expect(deps.push.sent).toHaveLength(1);
    expect(deps.sms.sent).toEqual([]);
    expect((await landedIn()).sms_sent_at).toBeNull();
  });

  it("delivering the same landing again sends no second text", async () => {
    await land();
    const { id } = await landedIn();

    await deliver(deps, id);

    expect(deps.sms.sent).toHaveLength(1);
  });

  it("a recipient with the fallback switched off gets no text", async () => {
    await deps.db.query(
      "update profiles set sms_fallback = false where id = $1",
      [world.priya.id],
    );

    await land();

    expect(deps.sms.sent).toEqual([]);
  });

  it.each(["hungry", "delayed"])("%s never produces a text", async (kind) => {
    const refId = crypto.randomUUID();
    await notify(deps, {
      userId: world.priya.id,
      kind,
      refId,
      title: "Gerald",
      body: "Something happened.",
      url: `/birds/${refId}`,
    });

    expect(deps.sms.sent).toEqual([]);
  });

  it("stays under 160 characters with the longest names", () => {
    const text = smsText("landed-in", {
      bird: "B".repeat(24),
      friend: "F".repeat(30),
      url: `https://${config.app.domain}/sill/${crypto.randomUUID()}`,
    });

    expect(text.length).toBeLessThan(160);
    expect(text.endsWith(STOP)).toBe(true);
  });

  describe("at most one text per 15 minutes", () => {
    async function landTwo() {
      const second = await insertPlannedDelivery(
        deps.db,
        world,
        deps.clock.now(),
        { from: world.rosa },
      );
      deps.clock.set(
        Math.max(flight.arriveAtMs, second.arriveAtMs) + MINUTE_MS,
      );
      await tick(deps);
      return landedIns();
    }

    it("two landings inside 15 minutes produce one text", async () => {
      const rows = await landTwo();

      expect(rows).toHaveLength(2);
      expect(deps.sms.sent).toHaveLength(1);
      expect(rows.filter((r) => r.sms_sent_at !== null)).toHaveLength(1);
    });

    it("drops a text 14 minutes after the last and sends one after 15", async () => {
      const [texted, dropped] = await landTwo();
      const sentAt = texted.sms_sent_at!.getTime();

      deps.clock.set(sentAt + 14 * MINUTE_MS);
      await deliver(deps, dropped.id);
      expect(deps.sms.sent).toHaveLength(1);

      deps.clock.set(sentAt + 15 * MINUTE_MS);
      await deliver(deps, dropped.id);
      expect(deps.sms.sent).toHaveLength(2);
    });

    it("a claim delayed waiting for the profile lock still holds back a landing 15 minutes after the stale time", async () => {
      await deps.db.query(
        "update profiles set sms_fallback = false where id = $1",
        [world.priya.id],
      );
      const [first, second] = await landTwo();
      await deps.db.query(
        "update profiles set sms_fallback = true where id = $1",
        [world.priya.id],
      );
      const calls = portCalls();
      const stale = deps.clock.now();
      let waited = false;
      deps.db = onProfileLock(deps.db, () => {
        if (waited) return;
        waited = true;
        deps.clock.set(stale + MINUTE_MS);
      });

      await deliver(deps, first.id);
      expect(calls).toEqual([stale + MINUTE_MS]);

      deps.clock.set(stale + 15 * MINUTE_MS);
      await deliver(deps, second.id);

      expect(calls).toEqual([stale + MINUTE_MS]);
    });

    it("the window length comes from config", async () => {
      deps.config = {
        ...config,
        game: {
          ...config.game,
          limits: { ...config.game.limits, smsWindowMinutes: 30 },
        },
      };
      const [texted, dropped] = await landTwo();
      const sentAt = texted.sms_sent_at!.getTime();

      deps.clock.set(sentAt + 20 * MINUTE_MS);
      await deliver(deps, dropped.id);
      expect(deps.sms.sent).toHaveLength(1);

      deps.clock.set(sentAt + 30 * MINUTE_MS);
      await deliver(deps, dropped.id);
      expect(deps.sms.sent).toHaveLength(2);
    });

    it("another person's recent text does not hold back this one", async () => {
      await deps.db.query(
        `insert into notifications (user_id, kind, ref_id, title, body, url, created_at, sms_sent_at)
         values ($1, 'landed-in', $2, 'Pip', 'Pip landed.', '/', $3, $3)`,
        [
          world.rosa.id,
          crypto.randomUUID(),
          new Date(deps.clock.now()).toISOString(),
        ],
      );

      await land();

      expect(deps.sms.sent).toHaveLength(1);
    });
  });

  describe("opt-out", () => {
    it("an unsubscribed error turns the setting off and nothing more is sent", async () => {
      deps.sms.failNext(SMS_UNSUBSCRIBED);

      await land();

      expect(deps.sms.sent).toEqual([]);
      expect(await smsFallbackOf(world.priya)).toBe(false);

      const later = await insertPlannedDelivery(
        deps.db,
        world,
        deps.clock.now(),
        { from: world.rosa },
      );
      deps.clock.set(later.arriveAtMs + 5 * MINUTE_MS);
      await tick(deps);

      expect(await landedIns()).toHaveLength(2);
      expect(deps.sms.sent).toEqual([]);
    });

    it("a delivery that read the setting before an unsubscribe committed sends nothing", async () => {
      const calls: number[] = [];
      let unsubscribe = () => {};
      deps.sms.send = async () => {
        calls.push(deps.clock.now());
        if (calls.length === 1) {
          await new Promise<void>((_, reject) => {
            unsubscribe = () => reject(new SmsError(SMS_UNSUBSCRIBED));
          });
        }
      };
      await deps.db.query(
        "update profiles set sms_fallback = false where id = $1",
        [world.priya.id],
      );
      const second = await insertPlannedDelivery(
        deps.db,
        world,
        deps.clock.now(),
        { from: world.rosa },
      );
      deps.clock.set(
        Math.max(flight.arriveAtMs, second.arriveAtMs) + MINUTE_MS,
      );
      await tick(deps);
      const [one, two] = await landedIns();
      await deps.db.query(
        "update profiles set sms_fallback = true where id = $1",
        [world.priya.id],
      );
      const first = deliver(deps, one.id);
      await vi.waitFor(() => expect(calls).toHaveLength(1));

      deps.clock.set(deps.clock.now() + 15 * MINUTE_MS);
      let resume = () => {};
      const resumed = new Promise<void>((r) => (resume = r));
      let paused = false;
      const db = deps.db;
      const secondDeps = {
        ...deps,
        db: {
          query: db.query.bind(db),
          tx: async <T>(fn: (tx: Db) => Promise<T>) => {
            paused = true;
            await resumed;
            return db.tx(fn);
          },
        },
      };
      const pending = deliver(secondDeps, two.id);
      await vi.waitFor(() => expect(paused).toBe(true));

      unsubscribe();
      await first;
      expect(await smsFallbackOf(world.priya)).toBe(false);
      resume();
      await pending;

      expect(calls).toHaveLength(1);
    });

    it("any other send error leaves the setting on", async () => {
      deps.sms.failNext(30003);

      await land();

      expect(deps.sms.sent).toEqual([]);
      expect(await smsFallbackOf(world.priya)).toBe(true);
    });
  });
});
