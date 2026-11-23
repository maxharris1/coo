import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import type { OnboardedCaller } from "@/server/auth";
import { poolDb, TYPE_PARSERS, type Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import type { Row } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld } from "@/test/seedWorld";
import { deleteAccount } from "./account";
import { searchPlaces } from "./places";

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
  throw new Error("search and account deletion never waited on a lock");
}

function pausedAfter(statement: string) {
  const reached = gate();
  const resume = gate();
  const paused = (base: Db): Db => ({
    async query<T>(sql: string, params?: unknown[]) {
      const rows = await base.query<T>(sql, params);
      if (sql.includes(statement)) {
        reached.open();
        await resume.opened;
      }
      return rows;
    },
    tx: (fn) => base.tx((tx) => fn(paused(tx))),
  });
  return { paused, reached: reached.opened, resume: resume.open };
}

type Scene = {
  admin: pg.Pool;
  database: string;
  db: Db;
  deps: TestDeps;
  caller: OnboardedCaller;
};

async function onPostgres(
  hold: ReturnType<typeof pausedAfter>,
  run: (scene: Scene) => Promise<void>,
) {
  const database = `coo_places_${randomUUID().replaceAll("-", "")}`;
  const admin = pool(new URL(url!).pathname.slice(1) || "postgres");
  await admin.query(`create database ${database}`);
  const conn = pool(database, "-c deadlock_timeout=50ms");
  try {
    await migrate(conn);
    const db = poolDb(conn);
    const deps = await makeTestDeps({ db });
    const world = await seedWorld(db, deps.clock.now());
    const [profile] = await db.query<Row<"profiles">>(
      "select * from profiles where id = $1",
      [world.max.id],
    );
    const caller = {
      userId: world.max.id as UserId,
      profile: profile as OnboardedCaller["profile"],
    };
    await run({ admin, database, db, deps, caller });
  } finally {
    hold.resume();
    await conn.end();
    await admin.query(`drop database ${database}`);
    await admin.end();
  }
}

const HELD_PLACES =
  "select payload from geo_cache where payload ->> 'userId' = $1";

describe.skipIf(!url)(
  "place search racing account deletion on PostgreSQL",
  () => {
    it("rejects a search that reaches the user row after the delete took it", async () => {
      const hold = pausedAfter("delete from auth.users");
      await onPostgres(hold, async ({ admin, database, db, deps, caller }) => {
        const deletion = deleteAccount(
          { ...deps, db: hold.paused(db) },
          caller,
        );
        await hold.reached;
        const search = searchPlaces(deps, caller.userId, "East Village");
        await untilLockWait(admin, database);
        hold.resume();

        const [deleted, searched] = await Promise.allSettled([
          deletion,
          search,
        ]);
        expect(deleted).toEqual({
          status: "fulfilled",
          value: { deleted: true },
        });
        expect(searched).toMatchObject({
          status: "rejected",
          reason: { code: "unauthenticated" },
        });
        expect(await db.query(HELD_PLACES, [caller.userId])).toEqual([]);
      });
    });

    it("removes places a search held before the delete reached the user row", async () => {
      const hold = pausedAfter("for key share");
      await onPostgres(hold, async ({ admin, database, db, deps, caller }) => {
        const search = searchPlaces(
          { ...deps, db: hold.paused(db) },
          caller.userId,
          "East Village",
        );
        await hold.reached;
        const deletion = deleteAccount(deps, caller);
        await untilLockWait(admin, database);
        hold.resume();

        const [searched, deleted] = await Promise.allSettled([
          search,
          deletion,
        ]);
        expect(searched).toMatchObject({
          status: "fulfilled",
          value: { results: [{ label: "East Village" }] },
        });
        expect(deleted).toEqual({
          status: "fulfilled",
          value: { deleted: true },
        });
        expect(await db.query(HELD_PLACES, [caller.userId])).toEqual([]);
        expect(
          await db.query("select id from auth.users where id = $1", [
            caller.userId,
          ]),
        ).toEqual([]);
      });
    });
  },
);
