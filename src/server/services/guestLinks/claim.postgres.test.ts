import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { poolDb, TYPE_PARSERS, type Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { makeTestDeps } from "@/test/deps";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld } from "@/test/seedWorld";
import { landDeliveries } from "../tick/landDeliveries";
import { claimGuestLink } from "./claim";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
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
  throw new Error("claim never waited on a lock");
}

describe.skipIf(!url)("claimGuestLink on PostgreSQL", () => {
  it("completes and hosts the visit when it overlaps the landing (ac-3)", async () => {
    const database = `coo_claim_${randomUUID().replaceAll("-", "")}`;
    const admin = pool(new URL(url!).pathname.slice(1) || "postgres");
    await admin.query(`create database ${database}`);
    const conn = pool(database, "-c deadlock_timeout=50ms");
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
      const { token, flightId, arriveAt } = await sendGuestFlight(deps, world);
      deps.clock.set(arriveAt + 1);

      const landingHoldsFlight = gate();
      const resumeLanding = gate();
      const paused = (base: Db): Db => ({
        async query<T>(sql: string, params?: unknown[]) {
          const rows = await base.query<T>(sql, params);
          if (sql.includes("update flights set status = 'landed'")) {
            landingHoldsFlight.open();
            await resumeLanding.opened;
          }
          return rows;
        },
        tx: (fn) => base.tx((tx) => fn(paused(tx))),
      });

      const landing = landDeliveries({
        deps: { ...deps, db: paused(db) },
        limit: 50,
        timeUp: () => false,
      });
      await landingHoldsFlight.opened;
      const claim = claimGuestLink(deps, rosa, PEPPER, token);
      await untilLockWait(admin, database);
      resumeLanding.open();

      const [landed, claimed] = await Promise.allSettled([landing, claim]);
      expect(landed).toEqual({
        status: "fulfilled",
        value: { count: 1, failed: 0 },
      });
      expect(claimed).toEqual({
        status: "fulfilled",
        value: { friendId: max, visitId: expect.any(String) },
      });
      expect(
        await db.query("select host_id from visits where flight_id = $1", [
          flightId,
        ]),
      ).toEqual([{ host_id: rosa }]);
    } finally {
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });
});
