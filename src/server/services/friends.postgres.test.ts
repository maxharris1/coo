import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { poolDb, TYPE_PARSERS, type Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { makeTestDeps } from "@/test/deps";
import { seedWorld } from "@/test/seedWorld";
import { asRole } from "@/test/testDb";
import type { GuestSendResult } from "./flights/guestSend";
import { send } from "./flights/send";
import { joinByCode } from "./friends";
import { onboard } from "./onboarding";
import { searchPlaces } from "./places";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: "test-pepper" }),
}));

const url = process.env.TEST_POSTGRES_URL;

function pool(database: string): pg.Pool {
  const target = new URL(url!);
  target.pathname = `/${database}`;
  return new pg.Pool({
    connectionString: target.toString(),
    types: {
      getTypeParser: (oid: number, format?: "text" | "binary") =>
        TYPE_PARSERS[oid] ?? pg.types.getTypeParser(oid, format),
    },
  });
}

async function migrate(db: pg.Pool) {
  await db.query(readFileSync("supabase/test/auth-stub.sql", "utf8"));
  for (const file of readdirSync("supabase/migrations").sort()) {
    if (!file.endsWith(".sql") || file === "0002_cron.sql") continue;
    await db.query(readFileSync(join("supabase/migrations", file), "utf8"));
  }
}

describe.skipIf(!url)("joinByCode on PostgreSQL", () => {
  it("claims a mid-flight send to the joiner's phone as the coo_app role (ac-2)", async () => {
    const database = `coo_join_${randomUUID().replaceAll("-", "")}`;
    const admin = pool(new URL(url!).pathname.slice(1) || "postgres");
    await admin.query(`create database ${database}`);
    const conn = pool(database);
    try {
      await migrate(conn);
      const db = poolDb(conn);
      const deps = await makeTestDeps({ db });
      const world = await seedWorld(db, deps.clock.now());
      const max = world.max.id as UserId;
      const rosa = world.rosa.id as UserId;
      await db.query("delete from friendships where a_id = $1 and b_id = $2", [
        ...pair(max, rosa),
      ]);
      const { results } = await searchPlaces(deps, max, "Williamsburg");
      const sent = (await send(deps, max, {
        body: "Come see the new loft",
        sends: [
          {
            guest: { name: "Pal", placeId: results[0].placeId },
            birdId: world.max.birds[0].id,
          },
        ],
      })) as GuestSendResult;
      const flightId = sent.flights[0].id;
      await db.query(
        `update guest_links set notify_phone = (select phone from auth.users where id = $2)
         where id = (select guest_link_id from flights where id = $1)`,
        [flightId, rosa],
      );
      deps.clock.advance(60_000);
      const attribution = () =>
        db.query<Record<string, unknown>>(
          `select g.status, g.claimed_by, f.counterpart_id, n.recipient_id, f.arrive_at
             from flights f
             join guest_links g on g.id = f.guest_link_id
             join notes n on n.id = f.note_id
            where f.id = $1`,
          [flightId],
        );
      const [before] = await attribution();

      await joinByCode(
        { ...deps, db: asRole(poolDb(conn), "coo_app") },
        rosa,
        "seed-max",
      );

      expect(await attribution()).toEqual([
        {
          status: "claimed",
          claimed_by: rosa,
          counterpart_id: rosa,
          recipient_id: rosa,
          arrive_at: before.arrive_at,
        },
      ]);
      expect(
        await db.query(
          "select status from friendships where a_id = $1 and b_id = $2",
          pair(max, rosa),
        ),
      ).toEqual([{ status: "accepted" }]);
    } finally {
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });

  it("claims for existing friends while a repeat onboarding syncs the joiner's phone (ac-2)", async () => {
    const database = `coo_join_${randomUUID().replaceAll("-", "")}`;
    const admin = pool(new URL(url!).pathname.slice(1) || "postgres");
    await admin.query(`create database ${database}`);
    const conn = pool(database);
    const watcher = pool(database);
    try {
      await migrate(conn);
      const db = poolDb(conn);
      const deps = await makeTestDeps({ db });
      const world = await seedWorld(db, deps.clock.now());
      const max = world.max.id as UserId;
      const rosa = world.rosa.id as UserId;
      const { results } = await searchPlaces(deps, max, "Williamsburg");
      const sent = (await send(deps, max, {
        body: "Come see the new loft",
        sends: [
          {
            guest: { name: "Pal", placeId: results[0].placeId },
            birdId: world.max.birds[0].id,
          },
        ],
      })) as GuestSendResult;
      const flightId = sent.flights[0].id;
      await db.query("update auth.users set phone = $2 where id = $1", [
        rosa,
        "+1 (555) 765-4321",
      ]);
      await db.query(
        `update guest_links set notify_phone = '15557654321'
         where id = (select guest_link_id from flights where id = $1)`,
        [flightId],
      );
      deps.clock.advance(60_000);

      let resumeOnboarding!: () => void;
      const onboardingResumed = new Promise<void>(
        (r) => (resumeOnboarding = r),
      );
      let phoneSynced!: () => void;
      const onboardingPaused = new Promise<void>((r) => (phoneSynced = r));
      let flightLocked!: () => void;
      const joinLockedFlight = new Promise<void>((r) => (flightLocked = r));
      const hooked = (after: (sql: string) => Promise<void> | void): Db => {
        const base = poolDb(conn);
        const wrap = (t: Db): Db => ({
          async query<T>(sql: string, params?: unknown[]) {
            const rows = await t.query<T>(sql, params);
            await after(sql);
            return rows;
          },
          tx: t.tx,
        });
        return asRole(
          { query: base.query, tx: (fn) => base.tx((t) => fn(wrap(t))) },
          "coo_app",
        );
      };
      const onboardingDb = hooked(async (sql) => {
        if (!sql.includes("sync_phone_last4")) return;
        phoneSynced();
        await onboardingResumed;
      });
      const joinDb = hooked((sql) => {
        if (/from flights .* for update/s.test(sql)) flightLocked();
      });
      const joinBlocked = async () => {
        for (;;) {
          const { rows } = await watcher.query(
            "select 1 from pg_stat_activity where datname = $1 and wait_event_type = 'Lock'",
            [database],
          );
          if (rows.length > 0) return;
          await new Promise((r) => setTimeout(r, 20));
        }
      };

      const onboarding = onboard({ ...deps, db: onboardingDb }, rosa, {
        name: "Rosa",
        timezone: "America/New_York",
        bird: { name: "Gerald", look: "gerald", pronoun: "he" },
      });
      await onboardingPaused;
      const joining = joinByCode({ ...deps, db: joinDb }, rosa, "seed-max");
      await Promise.race([joinLockedFlight, joinBlocked()]);
      resumeOnboarding();

      const [onboarded, joined] = await Promise.allSettled([
        onboarding,
        joining,
      ]);
      expect(onboarded.status).toBe("fulfilled");
      expect(joined).toEqual({
        status: "fulfilled",
        value: { friend: expect.objectContaining({ id: max }) },
      });
      expect(
        await db.query(
          `select g.status, g.claimed_by, f.counterpart_id, n.recipient_id, p.phone_last4
             from flights f
             join guest_links g on g.id = f.guest_link_id
             join notes n on n.id = f.note_id
             join profiles p on p.id = $2
            where f.id = $1`,
          [flightId, rosa],
        ),
      ).toEqual([
        {
          status: "claimed",
          claimed_by: rosa,
          counterpart_id: rosa,
          recipient_id: rosa,
          phone_last4: "4321",
        },
      ]);
    } finally {
      await watcher.end();
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });
});
