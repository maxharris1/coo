import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { poolDb, TYPE_PARSERS, type Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import type { OnboardedCaller } from "@/server/auth";
import { pair } from "@/server/rows";
import { makeTestDeps } from "@/test/deps";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld } from "@/test/seedWorld";
import type { GuestSendResult } from "../flights/guestSend";
import { sendSearchParty } from "../flights/searchParty";
import { send } from "../flights/send";
import { searchPlaces } from "../places";
import { landDeliveries } from "../tick/landDeliveries";
import { claimGuestLink } from "./claim";
import { resolveLinksBetween } from "./resolve";

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

async function lockWaiting(admin: pg.Pool, database: string) {
  const { rows } = await admin.query(
    "select 1 from pg_stat_activity where datname = $1 and wait_event_type = 'Lock'",
    [database],
  );
  return rows.length > 0;
}

async function untilLockWait(admin: pg.Pool, database: string) {
  for (let i = 0; i < 100; i++) {
    if (await lockWaiting(admin, database)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("claim never waited on a lock");
}

async function namedGuestSend(
  deps: Awaited<ReturnType<typeof makeTestDeps>>,
  sender: UserId,
  birdId: string,
  name: string,
) {
  const { results } = await searchPlaces(deps, sender, "Williamsburg");
  const result = (await send(deps, sender, {
    body: "Come see the new loft",
    sends: [{ guest: { name, placeId: results[0].placeId }, birdId }],
  })) as GuestSendResult;
  const url = result.guestLinks[0].url;
  return {
    token: url.slice(url.lastIndexOf("-") + 1),
    flightId: result.flights[0].id,
  };
}

async function guestSendTo(
  deps: Awaited<ReturnType<typeof makeTestDeps>>,
  sender: UserId,
  birdId: string,
  recipient: UserId,
) {
  const { results } = await searchPlaces(deps, sender, "Williamsburg");
  const result = (await send(deps, sender, {
    body: "Come see the new loft",
    sends: [{ guest: { name: "Pal", placeId: results[0].placeId }, birdId }],
  })) as GuestSendResult;
  const url = result.guestLinks[0].url;
  await deps.db.query(
    `update guest_links set notify_phone = (select phone from auth.users where id = $2)
     where id = (select guest_link_id from flights where id = $1)`,
    [result.flights[0].id, recipient],
  );
  return url.slice(url.lastIndexOf("-") + 1);
}

function pausedAfterFirstFlightLock(
  base: Db,
  held: () => void,
  resume: Promise<void>,
) {
  let paused = false;
  const wrap = (db: Db): Db => ({
    async query<T>(sql: string, params?: unknown[]) {
      const rows = await db.query<T>(sql, params);
      if (!paused && /from flights[\s\S]*for update/.test(sql)) {
        paused = true;
        held();
        await resume;
      }
      return rows;
    },
    tx: (fn) => db.tx((tx) => fn(wrap(tx))),
  });
  return wrap(base);
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
      const claim = claimGuestLink(deps, rosa, PEPPER, "203.0.113.7", token);
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

  it("claims crossed links from both sides at once without a deadlock", async () => {
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
      const toRosa = await guestSendTo(deps, max, world.max.birds[0].id, rosa);
      const toMax = await guestSendTo(deps, rosa, world.rosa.birds[0].id, max);

      const resume = gate();
      const rosaHolds = gate();
      const maxHolds = gate();
      const rosaClaim = claimGuestLink(
        {
          ...deps,
          db: pausedAfterFirstFlightLock(db, rosaHolds.open, resume.opened),
        },
        rosa,
        PEPPER,
        "203.0.113.7",
        toRosa,
      );
      await rosaHolds.opened;
      const maxClaim = claimGuestLink(
        {
          ...deps,
          db: pausedAfterFirstFlightLock(db, maxHolds.open, resume.opened),
        },
        max,
        PEPPER,
        "203.0.113.8",
        toMax,
      );
      await Promise.race([maxHolds.opened, untilLockWait(admin, database)]);
      resume.open();

      expect(await Promise.allSettled([rosaClaim, maxClaim])).toEqual([
        { status: "fulfilled", value: { friendId: max } },
        { status: "fulfilled", value: { friendId: rosa } },
      ]);
      expect(
        await db.query(
          "select sender_id, claimed_by from guest_links order by sender_id",
        ),
      ).toEqual([
        { sender_id: max, claimed_by: rosa },
        { sender_id: rosa, claimed_by: max },
      ]);
      expect(
        await db.query(
          "select 1 from friendships where a_id = $1 and b_id = $2",
          [...pair(max, rosa)],
        ),
      ).toHaveLength(1);
    } finally {
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });

  it("claims a name-only crossed send whose flight another request holds", async () => {
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
      const toRosa = await namedGuestSend(
        deps,
        max,
        world.max.birds[0].id,
        "Rosa",
      );
      const toMax = await namedGuestSend(
        deps,
        rosa,
        world.rosa.birds[0].id,
        "Max",
      );

      const searchHoldsFlight = gate();
      const resumeSearch = gate();
      const paused = (base: Db): Db => ({
        async query<T>(sql: string, params?: unknown[]) {
          const rows = await base.query<T>(sql, params);
          if (sql.includes("from flights where id = $1 for update")) {
            searchHoldsFlight.open();
            await resumeSearch.opened;
          }
          return rows;
        },
        tx: (fn) => base.tx((tx) => fn(paused(tx))),
      });
      const search = sendSearchParty(
        { ...deps, db: paused(db) },
        { userId: rosa } as OnboardedCaller,
        toMax.flightId,
      );
      await searchHoldsFlight.opened;
      const claim = claimGuestLink(
        deps,
        rosa,
        PEPPER,
        "203.0.113.9",
        toRosa.token,
      );
      await Promise.race([claim, untilLockWait(admin, database)]);
      resumeSearch.open();

      const [searched, claimed] = await Promise.allSettled([search, claim]);
      expect(searched).toMatchObject({
        status: "rejected",
        reason: { code: "conflict" },
      });
      expect(claimed).toEqual({
        status: "fulfilled",
        value: { friendId: max },
      });
      expect(
        await db.query(
          `select g.status, g.claimed_by, f.status as flight_status,
                  f.counterpart_id, n.recipient_id
             from guest_links g
             join flights f on f.guest_link_id = g.id
             join notes n on n.id = f.note_id
            order by g.sender_id`,
        ),
      ).toEqual([
        {
          status: "claimed",
          claimed_by: rosa,
          flight_status: "flying",
          counterpart_id: rosa,
          recipient_id: rosa,
        },
        {
          status: "claimed",
          claimed_by: max,
          flight_status: "flying",
          counterpart_id: max,
          recipient_id: max,
        },
      ]);
    } finally {
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });

  it("resolveLinksBetween waits for a held flight instead of skipping its link", async () => {
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
      const toRosa = await namedGuestSend(
        deps,
        max,
        world.max.birds[0].id,
        "Rosa",
      );

      const holderHolds = gate();
      const release = gate();
      const holder = db.tx(async (tx) => {
        await tx.query("select 1 from flights where id = $1 for update", [
          toRosa.flightId,
        ]);
        holderHolds.open();
        await release.opened;
      });
      await holderHolds.opened;
      const resolving = db.tx((tx) =>
        resolveLinksBetween(tx, max, rosa, deps.clock.now()),
      );
      await Promise.race([resolving, untilLockWait(admin, database)]);
      release.open();
      await holder;

      expect(await resolving).toEqual([
        { linkId: expect.any(String), senderId: max, claimerId: rosa },
      ]);
    } finally {
      await conn.end();
      await admin.query(`drop database ${database}`);
      await admin.end();
    }
  });
});
