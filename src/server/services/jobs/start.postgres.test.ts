import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { offersFor } from "@/lib/game/jobs";
import { localDate } from "@/lib/game/time";
import type { OnboardedCaller, Profile } from "@/server/auth";
import { poolDb, TYPE_PARSERS, type Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps } from "@/test/deps";
import { seedWorld } from "@/test/seedWorld";
import { startJob } from "./start";

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
  throw new Error("second start never waited on a lock");
}

describe.skipIf(!url)("startJob on PostgreSQL", () => {
  it("lets only one of two birds started at once onto the same job", async () => {
    const database = `coo_jobs_${randomUUID().replaceAll("-", "")}`;
    const admin = pool(new URL(url!).pathname.slice(1) || "postgres");
    await admin.query(`create database ${database}`);
    const conn = pool(database, "-c deadlock_timeout=50ms");
    try {
      await migrate(conn);
      const db = poolDb(conn);
      const deps = await makeTestDeps({ db });
      const world = await seedWorld(db, deps.clock.now());
      const max = world.max.id as UserId;
      const [gerald, brenda] = world.max.birds;
      const [profile] = await db.query<Profile & { onboarded_at: Date }>(
        "select * from profiles where id = $1",
        [max],
      );
      const caller: OnboardedCaller = { userId: max, profile };
      const [offer] = offersFor(
        max,
        localDate(deps.clock.now(), profile.timezone),
      );

      const firstInserted = gate();
      const resumeFirst = gate();
      const paused = (base: Db): Db => ({
        async query<T>(sql: string, params?: unknown[]) {
          const rows = await base.query<T>(sql, params);
          if (sql.includes("insert into jobs")) {
            firstInserted.open();
            await resumeFirst.opened;
          }
          return rows;
        },
        tx: (fn) => base.tx((tx) => fn(paused(tx))),
      });

      const first = startJob({ ...deps, db: paused(db) }, caller, {
        jobId: offer.id,
        birdId: gerald.id,
      });
      await firstInserted.opened;
      const second = startJob(deps, caller, {
        jobId: offer.id,
        birdId: brenda.id,
      });
      await untilLockWait(admin, database);
      resumeFirst.open();

      const [started, refused] = await Promise.allSettled([first, second]);
      expect(started).toEqual({
        status: "fulfilled",
        value: {
          job: expect.objectContaining({
            jobId: offer.id,
            birdId: gerald.id,
          }),
        },
      });
      expect(refused).toMatchObject({
        status: "rejected",
        reason: {
          code: "conflict",
          message: `${gerald.name} is already on that job.`,
        },
      });
      expect(
        await db.query(
          "select bird_id from jobs where user_id = $1 and status = 'running'",
          [max],
        ),
      ).toEqual([{ bird_id: gerald.id }]);
      expect(
        await db.query("select status from birds where id = $1", [brenda.id]),
      ).toEqual([{ status: "home" }]);
    } finally {
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });
});
