import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { poolDb, TYPE_PARSERS, type PoolLike } from "@/server/db";
import { SMS_UNSUBSCRIBED } from "@/server/ports/sms";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { tick } from "../tick";
import { deliver } from "./deliver";

const url = process.env.TEST_POSTGRES_URL;
const MINUTE_MS = 60_000;
const NOON_NY = Date.UTC(2026, 10, 19, 17);

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

function holdFirstCommit(base: pg.Pool) {
  const holding = gate();
  const released = gate();
  let first = true;
  const connect = async () => {
    const client = await base.connect();
    const query = async (sql: string, params?: unknown[]) => {
      const result = await client.query(sql, params);
      if (first && sql === "COMMIT") {
        first = false;
        holding.open();
        await released.opened;
      }
      return result;
    };
    return new Proxy(client, {
      get: (target, key) =>
        key === "query" ? query : Reflect.get(target, key, target),
    });
  };
  const held: PoolLike = {
    query: base.query.bind(base),
    connect: connect as PoolLike["connect"],
  };
  return { db: poolDb(held), holding: holding.opened, release: released.open };
}

function portCalls(deps: TestDeps) {
  const calls: number[] = [];
  const send = deps.sms.send.bind(deps.sms);
  deps.sms.send = (to, body) => {
    calls.push(deps.clock.now());
    return send(to, body);
  };
  return calls;
}

async function withTwoLandings(
  run: (setup: {
    conn: pg.Pool;
    deps: TestDeps;
    world: World;
    landings: [string, string];
  }) => Promise<void>,
) {
  const database = `coo_sms_${randomUUID().replaceAll("-", "")}`;
  const admin = pool(new URL(url!).pathname.slice(1) || "postgres");
  await admin.query(`create database ${database}`);
  const conn = pool(database);
  try {
    await migrate(conn);
    const db = poolDb(conn);
    const deps = await makeTestDeps({ db });
    deps.clock.set(NOON_NY);
    const world = await seedWorld(db, deps.clock.now());
    await db.query("update profiles set sms_fallback = false where id = $1", [
      world.priya.id,
    ]);
    const one = await insertPlannedDelivery(db, world, deps.clock.now());
    const two = await insertPlannedDelivery(db, world, deps.clock.now(), {
      from: world.rosa,
    });
    deps.clock.set(Math.max(one.arriveAtMs, two.arriveAtMs) + MINUTE_MS);
    await tick(deps);
    await db.query("update profiles set sms_fallback = true where id = $1", [
      world.priya.id,
    ]);
    const rows = await db.query<{ id: string }>(
      "select id from notifications where kind = 'landed-in' and user_id = $1 order by created_at, id",
      [world.priya.id],
    );
    expect(rows).toHaveLength(2);
    await run({ conn, deps, world, landings: [rows[0].id, rows[1].id] });
  } finally {
    await conn.end();
    await admin.query(`drop database ${database}`);
    await admin.end();
  }
}

describe.skipIf(!url)("SMS fallback on PostgreSQL", () => {
  it("a first text whose claim COMMIT is acknowledged a minute late still holds back a landing 15 minutes after the commit", async () => {
    await withTwoLandings(async ({ conn, deps, landings: [first, second] }) => {
      const held = holdFirstCommit(conn);
      const late = { ...deps, db: held.db };
      const calls = portCalls(deps);
      const committedAt = deps.clock.now();

      const delivering = deliver(late, first);
      await held.holding;
      deps.clock.set(committedAt + MINUTE_MS);
      held.release();
      await delivering;

      deps.clock.set(committedAt + 15 * MINUTE_MS);
      await deliver(late, second);

      expect(calls).toEqual([committedAt + MINUTE_MS]);
    });
  });

  it("a claim whose COMMIT acknowledgment is held 16 minutes sends nothing once an unsubscribe is saved", async () => {
    await withTwoLandings(
      async ({ conn, deps, world, landings: [pending, sent] }) => {
        const held = holdFirstCommit(conn);
        const late = { ...deps, db: held.db };
        const calls = portCalls(deps);
        const claimedAt = deps.clock.now();

        const stalled = deliver(late, pending);
        await held.holding;
        deps.clock.set(claimedAt + 15 * MINUTE_MS);
        deps.sms.failNext(SMS_UNSUBSCRIBED);
        await deliver(late, sent);
        const [profile] = await late.db.query<{ sms_fallback: boolean }>(
          "select sms_fallback from profiles where id = $1",
          [world.priya.id],
        );
        expect(profile.sms_fallback).toBe(false);

        deps.clock.set(claimedAt + 16 * MINUTE_MS);
        held.release();
        await stalled;

        expect(calls).toEqual([claimedAt + 15 * MINUTE_MS]);
      },
    );
  });
});
