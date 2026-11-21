import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { poolDb, TYPE_PARSERS, type Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import type { GuestSendResult } from "@/server/services/flights/guestSend";
import { send } from "@/server/services/flights/send";
import { searchPlaces } from "@/server/services/places";
import { tick } from "@/server/services/tick";
import { makeTestDeps } from "@/test/deps";
import { seedWorld } from "@/test/seedWorld";
import { getGuestLink } from "./get";
import { reportGuestLink } from "./report";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const BODY = "PRIVATE AFTER REPORT";
const IP = "203.0.113.7";
const url = process.env.TEST_POSTGRES_URL;

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

describe.skipIf(!url)("getGuestLink on PostgreSQL", () => {
  it("never shows a note to a view that started before the link was reported (ac-2, ac-3)", async () => {
    const database = `coo_guest_${randomUUID().replaceAll("-", "")}`;
    const admin = pool(new URL(url!).pathname.slice(1) || "postgres");
    await admin.query(`create database ${database}`);
    const conn = pool(database);
    try {
      await migrate(conn);
      const db = poolDb(conn);
      const deps = await makeTestDeps({ db });
      const world = await seedWorld(db, deps.clock.now());
      const max = world.max.id as UserId;
      const { results } = await searchPlaces(deps, max, "Williamsburg");
      const sent = (await send(deps, max, {
        body: BODY,
        sends: [
          {
            guest: { name: "Sam", placeId: results[0].placeId },
            birdId: world.max.birds[0].id,
          },
        ],
      })) as GuestSendResult;
      const link = sent.guestLinks[0].url;
      const token = link.slice(link.lastIndexOf("-") + 1);
      const arriveAt = sent.flights[0].arriveAt as number;

      const viewFoundLink = gate();
      const resumeView = gate();
      const paused = (base: Db): Db => ({
        async query<T>(sql: string, params?: unknown[]) {
          const rows = await base.query<T>(sql, params);
          if (sql.includes("from guest_links g join profiles p")) {
            viewFoundLink.open();
            await resumeView.opened;
          }
          return rows;
        },
        tx: (fn) => base.tx((tx) => fn(paused(tx))),
      });

      deps.clock.set(arriveAt - 1);
      const view = getGuestLink({ ...deps, db: paused(db) }, PEPPER, IP, token);
      await viewFoundLink.opened;

      await reportGuestLink(deps, PEPPER, IP, token, "spam");
      deps.clock.set(arriveAt + 1000);
      await tick(deps);
      const [landed] = await db.query<{ status: string }>(
        "select status from flights where id = $1",
        [sent.flights[0].id],
      );
      expect(landed.status).toBe("landed");
      resumeView.open();

      const [seen] = await Promise.allSettled([view]);
      if (seen.status === "fulfilled") {
        expect(seen.value).not.toHaveProperty("note");
        expect(JSON.stringify(seen.value)).not.toContain(BODY);
      } else {
        expect(seen.reason).toMatchObject({ code: "not_found" });
      }
      await expect(getGuestLink(deps, PEPPER, IP, token)).rejects.toMatchObject(
        { code: "not_found" },
      );
    } finally {
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });
});
