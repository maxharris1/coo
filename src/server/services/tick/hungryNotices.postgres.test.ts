import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { toE164 } from "@/lib/phone";
import { requireOnboarded } from "@/server/auth";
import { poolDb, TYPE_PARSERS, type Db } from "@/server/db";
import { makeTestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld } from "@/test/seedWorld";
import { careAction } from "../care";
import { hungryNotices } from "./hungryNotices";

const url = process.env.TEST_POSTGRES_URL;

function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

function pool(database: string, options?: string): pg.Pool {
  const target = new URL(url!);
  target.pathname = `/${database}`;
  return new pg.Pool({
    connectionString: target.toString(),
    options,
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

async function untilLockWait(admin: pg.Pool, database: string) {
  for (let i = 0; i < 100; i++) {
    const { rows } = await admin.query(
      "select 1 from pg_stat_activity where datname = $1 and wait_event_type = 'Lock'",
      [database],
    );
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("feed never waited on a lock");
}

describe.skipIf(!url)("hungryNotices on PostgreSQL", () => {
  it("lets a feed that overlaps the hungry tick succeed", async () => {
    const database = `coo_locks_${randomUUID().replaceAll("-", "")}`;
    const admin = pool(new URL(url!).pathname.slice(1) || "postgres");
    await admin.query(`create database ${database}`);
    const conn = pool(database, "-c deadlock_timeout=50ms");
    try {
      await migrate(conn);
      const db = poolDb(conn);
      const deps = await makeTestDeps({ db });
      const world = await seedWorld(db, deps.clock.now());
      const gerald = world.max.birds[0].id;
      await db.query("update birds set belly = 0 where id = $1", [gerald]);
      const auth = deps.auth(new FakeJar());
      await auth.verifyCode(toE164("+15550000001")!, "000000");
      const caller = await requireOnboarded({ auth, db });
      const [{ seeds: seedsBefore }] = await db.query<{ seeds: number }>(
        "select seeds from profiles where id = $1",
        [caller.userId],
      );

      const tickHoldsBird = gate();
      const resumeTick = gate();
      const paused = (base: Db): Db => ({
        async query<T>(sql: string, params?: unknown[]) {
          const rows = await base.query<T>(sql, params);
          if (sql.includes("from birds b join profiles p")) {
            tickHoldsBird.open();
            await resumeTick.opened;
          }
          return rows;
        },
        tx: (fn) => base.tx((tx) => fn(paused(tx))),
      });

      const tick = hungryNotices({
        deps: { ...deps, db: paused(db) },
        limit: 50,
        timeUp: () => false,
      });
      await tickHoldsBird.opened;
      const feed = careAction(deps, caller, gerald, "feed", randomUUID());
      await untilLockWait(admin, database);
      resumeTick.open();

      const [ticked, fed] = await Promise.allSettled([tick, feed]);
      expect(ticked).toEqual({ status: "fulfilled", value: { count: 1 } });
      expect(fed).toEqual({
        status: "fulfilled",
        value: expect.objectContaining({
          bird: expect.objectContaining({
            belly: deps.config.game.care.feedBelly,
          }),
          seeds: seedsBefore - deps.config.game.seeds.feedCost,
        }),
      });
    } finally {
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });
});
