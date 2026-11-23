import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { poolDb, TYPE_PARSERS } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { makeTestDeps } from "@/test/deps";
import { seedWorld } from "@/test/seedWorld";
import { asRole } from "@/test/testDb";
import type { GuestSendResult } from "./flights/guestSend";
import { send } from "./flights/send";
import { joinByCode } from "./friends";
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
});
