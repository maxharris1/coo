import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { poolDb, TYPE_PARSERS, type Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps } from "@/test/deps";
import { seedWorld } from "@/test/seedWorld";
import { notify } from "../notify";
import { updateSettings } from "../settings";
import { flushQuietHours } from "./flushQuietHours";

const url = process.env.TEST_POSTGRES_URL;
const ELEVEN_PM_NY = Date.UTC(2026, 10, 20, 4);
const SEVEN_AM_NY = Date.UTC(2026, 10, 20, 12);

function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

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

async function untilLockWait(admin: pg.Pool, database: string) {
  for (let i = 0; i < 100; i++) {
    const { rows } = await admin.query(
      "select 1 from pg_stat_activity where datname = $1 and wait_event_type = 'Lock'",
      [database],
    );
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("flush never waited on the settings save");
}

function commitOnSignal(base: Db) {
  const saved = gate();
  const commit = gate();
  const db: Db = {
    query: (sql, params) => base.query(sql, params),
    tx: (fn) =>
      base.tx(async (tx) => {
        const out = await fn(tx);
        saved.open();
        await commit.opened;
        return out;
      }),
  };
  return { db, saved: saved.opened, commit: commit.open };
}

describe.skipIf(!url)("flushQuietHours on PostgreSQL", () => {
  it("a flush that overlaps an uncommitted quiet-off save pushes once the save commits", async () => {
    const database = `coo_quiet_${randomUUID().replaceAll("-", "")}`;
    const admin = pool(new URL(url!).pathname.slice(1) || "postgres");
    await admin.query(`create database ${database}`);
    const conn = pool(database);
    try {
      await migrate(conn);
      const db = poolDb(conn);
      const deps = await makeTestDeps({ db });
      deps.clock.set(ELEVEN_PM_NY);
      const world = await seedWorld(db, deps.clock.now());
      const priya = world.priya.id as UserId;
      await db.query(
        "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/priya', 'k', 'a')",
        [priya],
      );
      const refId = randomUUID();
      const held = (await notify(deps, {
        userId: priya,
        kind: "landed-in",
        refId,
        title: "Gerald has landed",
        body: "There is a note on your sill.",
        url: `/sill/${refId}`,
      }))!;
      expect(deps.push.sent).toEqual([]);

      deps.clock.set(SEVEN_AM_NY);
      await updateSettings(deps, priya, { quietEnd: 9 });
      const save = commitOnSignal(db);
      const saving = updateSettings({ ...deps, db: save.db }, priya, {
        quietOn: false,
      });
      await save.saved;

      const flushing = flushQuietHours({
        deps,
        userId: priya,
        limit: 50,
        timeUp: () => false,
      });
      try {
        await untilLockWait(admin, database);
      } finally {
        save.commit();
        await saving;
      }

      expect(await flushing).toEqual({ count: 1, failed: 0 });
      expect(deps.push.sent.map((s) => s.payload.tag)).toEqual([
        `landed-in:${refId}`,
      ]);
      const [row] = await db.query<{ push_sent_at: Date | null }>(
        "select push_sent_at from notifications where id = $1",
        [held.id],
      );
      expect(row.push_sent_at).toEqual(new Date(SEVEN_AM_NY));
    } finally {
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });
});
