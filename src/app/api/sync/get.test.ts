import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { offersFor } from "@/lib/game/jobs";
import { snap } from "@/lib/game/privacy";
import { localDate } from "@/lib/game/time";
import { toE164, type E164 } from "@/lib/phone";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { Db } from "@/server/db";
import { createJsonRoute } from "@/server/http";
import type { UserId } from "@/server/ports/auth";
import { startJob } from "@/server/services/jobs/start";
import { setLoft } from "@/server/services/loft";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld, type World } from "@/test/seedWorld";
import { asRole } from "@/test/testDb";
import { syncGet } from "./get";

const MAX_PHONE = "+15550000001";
const PRIYA_PHONE = "+15550000002";

let base: TestDeps;
let deps: TestDeps;
let world: World;
let statements: string[];
let heldSuffixUpdates: (() => void)[] | null;
let failingBackfill: Error | null;

function recordingDb(inner: Db): Db {
  return {
    async query(sql, params) {
      statements.push(sql);
      if (failingBackfill && /sync_phone_last4/i.test(sql)) {
        throw failingBackfill;
      }
      if (heldSuffixUpdates && /sync_phone_last4/i.test(sql)) {
        const held = heldSuffixUpdates;
        await new Promise<void>((release) => held.push(release));
      }
      return inner.query(sql, params);
    },
    tx: (fn) => inner.tx((db) => fn(recordingDb(db))),
  };
}

beforeEach(async () => {
  base = await makeTestDeps();
  statements = [];
  heldSuffixUpdates = null;
  failingBackfill = null;
  deps = { ...base, db: recordingDb(base.db) };
  world = await seedWorld(base.db, deps.clock.now());
});

async function signIn(phone: string) {
  const jar = new FakeJar();
  const id = await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return { id, jar };
}

async function sync(jar?: FakeJar, headers: Record<string, string> = {}) {
  const handler = syncGet(createJsonRoute(async () => deps));
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest("https://coo.test/api/sync", {
      headers: { cookie, ...headers },
    }),
  );
  return { status: res.status, json: await res.json() };
}

async function timezoneOf(id: string) {
  const [row] = await deps.db.query<{ timezone: string }>(
    "select timezone from profiles where id = $1",
    [id],
  );
  return row.timezone;
}

const profileUpdates = () =>
  statements.filter((s) => /update\s+profiles\s+set\s+timezone/i.test(s));

async function phoneLast4Of(id: string) {
  const [row] = await deps.db.query<{ phone_last4: string | null }>(
    "select phone_last4 from profiles where id = $1",
    [id],
  );
  return row.phone_last4;
}

async function onboardWithLoft(id: UserId) {
  await onboard(deps, id, {
    name: "Ada",
    timezone: "America/New_York",
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
  });
  const [profile] = await deps.db.query<Profile>(
    "select * from profiles where id = $1",
    [id],
  );
  await setLoft(
    deps,
    { userId: id, profile },
    { roost: snap(40.71427, -73.96143) },
  );
}

async function startJobFor(userId: string, birdId: string, offerIndex = 0) {
  const [profile] = await base.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [userId],
  );
  const caller: OnboardedCaller = { userId: userId as UserId, profile };
  const offer = offersFor(
    userId,
    localDate(deps.clock.now(), profile.timezone),
  )[offerIndex];
  const { job } = await startJob(base, caller, { jobId: offer.id, birdId });
  return job.id;
}

const jobIds = (json: { birds: { id: string; jobId: string | null }[] }) =>
  json.birds.map((b) => [b.id, b.jobId]);

describe("GET /api/sync", () => {
  describe("birds[].jobId", () => {
    it("is null for every bird at home", async () => {
      const { json } = await sync((await signIn(MAX_PHONE)).jar);
      expect(jobIds(json)).toEqual(world.max.birds.map((b) => [b.id, null]));
    });

    it("is the running job with a destination, and null for a bird whose job is done", async () => {
      const [gerald, brenda] = world.max.birds.map((b) => b.id);
      const running = await startJobFor(world.max.id, gerald);
      const done = await startJobFor(world.max.id, brenda, 1);
      await base.db.query("update jobs set status = 'done' where id = $1", [
        done,
      ]);
      await base.db.query(
        "update birds set status = 'home', busy_kind = null, busy_until = null where id = $1",
        [brenda],
      );

      const { status, json } = await sync((await signIn(MAX_PHONE)).jar);

      expect(status).toBe(200);
      expect(jobIds(json)).toEqual([
        [gerald, running],
        [brenda, null],
      ]);
    });

    it("is null for a running job with no destination", async () => {
      const [gerald, brenda] = world.max.birds.map((b) => b.id);
      const running = await startJobFor(world.max.id, gerald);
      await base.db.query(
        "update jobs set dest_lat = null, dest_lon = null, dest_label = null where id = $1",
        [running],
      );

      const { json } = await sync((await signIn(MAX_PHONE)).jar);

      expect(json.birds[0]).toMatchObject({ status: "busy", busyKind: "job" });
      expect(jobIds(json)).toEqual([
        [gerald, null],
        [brenda, null],
      ]);
    });
  });

  it("returns Max's two birds with computed care and nothing of Priya's", async () => {
    const { jar } = await signIn(MAX_PHONE);
    const { status, json } = await sync(jar);

    expect(status).toBe(200);
    expect(json.me.id).toBe(world.max.id);
    expect(json.birds.map((b: { id: string }) => b.id)).toEqual(
      world.max.birds.map((b) => b.id),
    );
    for (const bird of json.birds) {
      expect(bird).toMatchObject({
        belly: expect.any(Number),
        feathers: expect.any(Number),
        energy: expect.any(Number),
        hungry: false,
        canFly: true,
        noteLimit: config.game.notes.baseLimit,
      });
      expect(bird).not.toHaveProperty("ownerId");
    }

    const body = JSON.stringify(json);
    for (const leak of [
      world.priya.id,
      ...world.priya.birds.map((b) => b.id),
      ...world.priya.birds.map((b) => b.name),
      "Center City",
      "Philadelphia",
    ])
      expect(body).not.toContain(leak);
  });

  it("still returns both of two legacy birds that share a name", async () => {
    const [gerald, brenda] = world.max.birds.map((b) => b.id);
    await base.db.query("update birds set name = 'Gerald' where id = $1", [
      brenda,
    ]);
    const { jar } = await signIn(MAX_PHONE);

    const { status, json } = await sync(jar);

    expect(status).toBe(200);
    expect(
      json.birds.map((b: { id: string; name: string }) => [b.id, b.name]),
    ).toEqual([
      [gerald, "Gerald"],
      [brenda, "Gerald"],
    ]);
  });

  it("is 401 without a session and still carries serverNow", async () => {
    const { status, json } = await sync();
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(json.serverNow).toBe(deps.clock.now());
  });

  it("is 409 not_onboarded before onboarding and still carries serverNow", async () => {
    const { jar } = await signIn("(555) 123-4567");
    const { status, json } = await sync(jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
    expect(json.serverNow).toBe(deps.clock.now());
  });

  it("carries serverNow from the clock module on success", async () => {
    deps.clock.advance(90_000);
    const { jar } = await signIn(MAX_PHONE);
    const { json } = await sync(jar);
    expect(json.serverNow).toBe(deps.clock.now());
  });

  it("updates profiles.timezone when X-Timezone differs, and a repeat changes nothing", async () => {
    const { jar } = await signIn(MAX_PHONE);
    expect(await timezoneOf(world.max.id)).toBe("America/New_York");

    const first = await sync(jar, { "x-timezone": "Europe/London" });
    expect(first.json.me.timezone).toBe("Europe/London");
    expect(await timezoneOf(world.max.id)).toBe("Europe/London");
    expect(profileUpdates()).toHaveLength(1);

    const again = await sync(jar, { "x-timezone": "Europe/London" });
    expect(again.status).toBe(200);
    expect(again.json.me.timezone).toBe("Europe/London");
    expect(profileUpdates()).toHaveLength(1);
    expect(await timezoneOf(world.priya.id)).toBe("America/New_York");
  });

  it.each([[{}], [{ "x-timezone": "Mars/Olympus_Mons" }]])(
    "leaves the timezone alone for %j",
    async (headers) => {
      const { jar } = await signIn(MAX_PHONE);
      const { status } = await sync(jar, headers);
      expect(status).toBe(200);
      expect(await timezoneOf(world.max.id)).toBe("America/New_York");
      expect(profileUpdates()).toHaveLength(0);
    },
  );

  it("reads me, closet, outfits, egg, punch card, unread and friends from the caller's rows", async () => {
    const { max, priya, rosa } = world;
    const db = deps.db;
    await db.query(
      "update profiles set deliveries_count = 4, espresso_shots = 2, loft_items = '{flower-boxes,espresso-cart}' where id = $1",
      [max.id],
    );
    await db.query(
      "update profiles set loft_items = '{weathervane}' where id = $1",
      [priya.id],
    );
    await db.query(
      "insert into eggs (user_id, hatch_at_delivery, status) values ($1, 10, 'incubating'), ($2, 3, 'ready')",
      [max.id, priya.id],
    );
    await db.query(
      "insert into punch_cards (user_id, week_start, deliveries, paid) values ($1, '2026-11-16', 3, false), ($1, '2026-11-09', 9, true), ($2, '2026-11-16', 7, true)",
      [max.id, priya.id],
    );
    await db.query(
      `insert into notifications (user_id, kind, title, body, read_at) values
         ($1, 'landed', 't', 'b', null), ($1, 'landed', 't', 'b', null),
         ($1, 'landed', 't', 'b', now()), ($2, 'landed', 't', 'b', null)`,
      [max.id, priya.id],
    );
    await db.query(
      "insert into gear_owned (user_id, gear_id) values ($1, 'top_hat')",
      [priya.id],
    );
    await db.query(
      "insert into outfits (user_id, name, items) values ($1, 'Fancy', '{top_hat}')",
      [priya.id],
    );
    await db.query(
      "update friendships set status = 'blocked', blocked_by = $1 where $2 in (a_id, b_id)",
      [max.id, rosa.id],
    );
    const [lo, hi] = [priya.id, rosa.id].sort();
    await db.query("insert into friendships (a_id, b_id) values ($1, $2)", [
      lo,
      hi,
    ]);

    const { jar } = await signIn(MAX_PHONE);
    const { status, json } = await sync(jar);

    expect(status).toBe(200);
    expect(json.me).toMatchObject({
      id: max.id,
      name: "Max",
      handle: "max",
      seeds: config.game.start.seeds,
      timezone: "America/New_York",
      espressoShots: 2,
      loftItems: ["flower-boxes", "espresso-cart"],
      loft: { label: "East Village", city: "New York", travelling: false },
    });
    expect(json.closet).toEqual(config.game.start.gear);
    expect(json.outfits).toEqual([
      {
        id: expect.any(String),
        name: "Everyday",
        items: config.game.start.gear,
      },
    ]);
    expect(json.egg).toEqual({ status: "incubating", deliveriesToGo: 6 });
    expect(json.punchCard).toEqual({
      weekStart: "2026-11-16",
      deliveries: 3,
      size: config.game.seeds.punchCardSize,
      paid: false,
    });
    expect(json.jobs).toEqual({ running: 0, done: 0 });
    expect(json.found).toEqual([]);
    expect(json.unread).toBe(2);
    expect(json.friendsCount).toBe(1);
    expect(json.flights).toEqual([]);
    expect(json.visits).toEqual([]);
    expect(json.myVisiting).toEqual([]);
  });

  it("gives an empty punch card for a week with no row yet", async () => {
    const { jar } = await signIn(PRIYA_PHONE);
    const { json } = await sync(jar);
    expect(json.me.id).toBe(world.priya.id);
    expect(json.punchCard).toEqual({
      weekStart: "2026-11-16",
      deliveries: 0,
      size: config.game.seeds.punchCardSize,
      paid: false,
    });
  });

  describe("me.phoneLast4", () => {
    it("is the last four digits of the Auth phone for a newly onboarded user (ac-1)", async () => {
      const { id, jar } = await signIn("+15551234567");
      await onboardWithLoft(id);

      const { status, json } = await sync(jar);

      expect(status).toBe(200);
      expect(json.me.phoneLast4).toBe("4567");
      const [row] = await deps.db.query<{ stored: string; auth: string }>(
        `select p.phone_last4 as stored, right(u.phone, 4) as auth
           from profiles p join auth.users u on u.id = p.id
          where p.id = $1`,
        [id],
      );
      expect(row.stored).toBe(row.auth);
    });

    it("as coo_app, sync fills me.phoneLast4 (ac-1)", async () => {
      deps = { ...base, db: recordingDb(asRole(base.db, "coo_app")) };
      const { id, jar } = await signIn("+15551234567");
      await onboardWithLoft(id);
      await base.db.query(
        "update profiles set phone_last4 = null where id = $1",
        [id],
      );

      const { status, json } = await sync(jar);

      expect(status).toBe(200);
      expect(json.me.phoneLast4).toBe("4567");
      expect(await phoneLast4Of(id)).toBe("4567");
    });

    it("a failing backfill still returns 200 and warns without the number (ac-3)", async () => {
      const warned: string[] = [];
      const captured: unknown[][] = [];
      for (const method of ["log", "info", "error"] as const)
        vi.spyOn(console, method).mockImplementation((...args) => {
          captured.push(args);
        });
      vi.spyOn(console, "warn").mockImplementation((...args) => {
        captured.push(args);
        warned.push(String(args[0]));
      });
      try {
        const { jar } = await signIn(MAX_PHONE);
        failingBackfill = Object.assign(
          new Error("permission denied for +15551234567"),
          { code: "42501", detail: "phone 15551234567" },
        );

        const { status, json } = await sync(jar);

        expect(status).toBe(200);
        expect(json.me.id).toBe(world.max.id);
        expect(json.me.phoneLast4).toBeNull();
        expect(warned.map((line) => JSON.parse(line))).toEqual([
          { level: "warn", event: "sync.phone_last4_failed", code: "42501" },
        ]);
        const seen = JSON.stringify([captured.flat().map(String), json]);
        for (const digits of ["1234567", "5550000001"])
          expect(seen).not.toContain(digits);
      } finally {
        vi.restoreAllMocks();
      }
    });

    it("fills an old null profile and follows a phone change in Auth (ac-2)", async () => {
      const { jar } = await signIn(MAX_PHONE);
      expect(await phoneLast4Of(world.max.id)).toBeNull();

      const first = await sync(jar);
      expect(first.json.me.phoneLast4).toBe("0001");
      expect(await phoneLast4Of(world.max.id)).toBe("0001");

      await deps.db.query("update auth.users set phone = $2 where id = $1", [
        world.max.id,
        "15559876543",
      ]);
      const next = await sync(jar);
      expect(next.json.me.phoneLast4).toBe("6543");
      expect(await phoneLast4Of(world.max.id)).toBe("6543");
    });

    async function overlappingSyncs(jar: FakeJar) {
      const held: (() => void)[] = [];
      heldSuffixUpdates = held;
      const a = sync(jar);
      await vi.waitFor(() => expect(held).toHaveLength(1));
      const b = sync(jar);
      await vi.waitFor(() => expect(held).toHaveLength(2));
      heldSuffixUpdates = null;
      held[0]();
      const first = await a;
      held[1]();
      const second = await b;
      return [first, second];
    }

    it("returns the current suffix to both of two overlapping syncs that fill a null profile (ac-2)", async () => {
      const { jar } = await signIn(MAX_PHONE);
      expect(await phoneLast4Of(world.max.id)).toBeNull();

      const responses = await overlappingSyncs(jar);

      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(await phoneLast4Of(world.max.id)).toBe("0001");
      expect(responses.map((r) => r.json.me.phoneLast4)).toEqual([
        "0001",
        "0001",
      ]);
    });

    it("returns the current suffix to both of two overlapping syncs after an Auth phone change (ac-2)", async () => {
      const { jar } = await signIn(MAX_PHONE);
      await sync(jar);
      expect(await phoneLast4Of(world.max.id)).toBe("0001");
      await deps.db.query("update auth.users set phone = $2 where id = $1", [
        world.max.id,
        "15559876543",
      ]);

      const responses = await overlappingSyncs(jar);

      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(await phoneLast4Of(world.max.id)).toBe("6543");
      expect(responses.map((r) => r.json.me.phoneLast4)).toEqual([
        "6543",
        "6543",
      ]);
    });

    it("never puts the full number in a response or a log line, and never touches another user (ac-3)", async () => {
      const captured: unknown[][] = [];
      for (const method of ["log", "info", "warn", "error"] as const)
        vi.spyOn(console, method).mockImplementation((...args) => {
          captured.push(args);
        });
      try {
        const { id, jar } = await signIn("+15551234567");
        await onboardWithLoft(id);
        const mine = await sync(jar);
        const max = await sync((await signIn(MAX_PHONE)).jar);

        expect(mine.json.me.phoneLast4).toBe("4567");
        expect(max.json.me.phoneLast4).toBe("0001");
        expect(await phoneLast4Of(world.priya.id)).toBeNull();
        for (const body of [
          JSON.stringify(mine.json),
          JSON.stringify(max.json),
        ])
          for (const full of ["5551234567", "5550000001", "5550000002"])
            expect(body).not.toContain(full);
        const logged = JSON.stringify(captured.flat().map(String));
        for (const full of ["5551234567", "5550000001"])
          expect(logged).not.toContain(full);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
