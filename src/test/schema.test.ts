import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { testDb } from "@/test/testDb";

let db: Db;
let max: string;
let priya: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const [row] = await db.query<T>(sql, params);
  return row;
}

async function user(handle: string): Promise<string> {
  const { id } = await one<{ id: string }>(
    "insert into auth.users default values returning id",
  );
  await db.query(
    "insert into profiles (id, name, handle, invite_code) values ($1, $2, $2, $3)",
    [id, handle, handle + "-abcd"],
  );
  return id;
}

async function bird(owner: string): Promise<string> {
  const row = await one<{ id: string }>(
    "insert into birds (owner_id, name, speed_mph, focus, navigation) values ($1, 'Gerald', 45, 2, 4) returning id",
    [owner],
  );
  return row.id;
}

function fly(birdId: string, status: string): Promise<{ id: string }> {
  return one<{ id: string }>(
    `insert into flights (kind, bird_id, owner_id, counterpart_id, from_lat, from_lon, from_label, to_lat, to_lon, to_label, status, release_at)
     values ('delivery', $1, $2, $3, 40.73, -73.99, 'East Village', 39.95, -75.17, 'Philadelphia', $4, now()) returning id`,
    [birdId, max, priya, status],
  );
}

async function seeds(
  user: string,
  delta: number,
  reason: string,
  ref: string | null = null,
): Promise<number> {
  const row = await one<{ n: number }>(
    "select apply_seeds($1, $2, $3, $4) as n",
    [user, delta, reason, ref],
  );
  return row.n;
}

async function uuid(): Promise<string> {
  return (await one<{ id: string }>("select gen_random_uuid() as id")).id;
}

const OWNED_BY = {
  profiles: "id = $1",
  friendships: "a_id = $1 or b_id = $1",
  birds: "owner_id = $1",
  flights: "owner_id = $1",
  notes: "sender_id = $1",
  seed_ledger: "user_id = $1",
  eggs: "user_id = $1",
  events: "user_id = $1",
};

async function owned(table: string, where: string): Promise<number> {
  const row = await one<{ n: number }>(
    `select count(*)::int as n from ${table} where ${where}`,
    [max],
  );
  return row.n;
}

describe("schema", () => {
  beforeEach(async () => {
    db = await testDb();
    max = await user("max");
    priya = await user("priya");
  });

  it("every table has row level security on, and only events has a browser policy", async () => {
    const off = await db.query(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity",
    );
    expect(off).toEqual([]);
    const pol = await db.query(
      "select tablename, policyname, roles from pg_policies where schemaname = 'public' order by tablename",
    );
    expect(pol).toEqual([
      {
        tablename: "events",
        policyname: "events_read_own",
        roles: ["authenticated"],
      },
      {
        tablename: "tick_health",
        policyname: "tick_health_app",
        roles: ["coo_app"],
      },
    ]);
  });

  it("coo_app reaches auth.users only through sync_phone_last4, which no browser role may run (ac-2)", async () => {
    const privileges = await one(
      `select has_schema_privilege('coo_app', 'auth', 'usage') as auth_usage,
              has_table_privilege('coo_app', 'auth.users', 'select') as users_select,
              has_function_privilege('coo_app', 'public.sync_phone_last4(uuid)', 'execute') as app,
              has_function_privilege('anon', 'public.sync_phone_last4(uuid)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.sync_phone_last4(uuid)', 'execute') as authenticated,
              exists (
                select from pg_proc p, aclexplode(p.proacl) a
                 where p.oid = 'public.sync_phone_last4(uuid)'::regprocedure and a.grantee = 0
              ) as public`,
    );
    expect(privileges).toEqual({
      auth_usage: false,
      users_select: false,
      app: true,
      anon: false,
      authenticated: false,
      public: false,
    });
    const fn = await one(
      "select prosecdef, proconfig from pg_proc where oid = 'public.sync_phone_last4(uuid)'::regprocedure",
    );
    expect(fn).toEqual({ prosecdef: true, proconfig: ['search_path=""'] });
    for (const role of ["anon", "authenticated"])
      await expect(
        db.tx(async (t) => {
          await t.query(`set local role ${role}`);
          await t.query("select public.sync_phone_last4($1)", [max]);
        }),
      ).rejects.toThrow(/permission denied/);
  });

  it("seeds: earn, spend, never below zero, never twice", async () => {
    const ref = await uuid();
    expect(await seeds(max, 60, "welcome")).toBe(60);
    expect(await seeds(max, 13, "delivery", ref)).toBe(73);
    expect(await seeds(max, 13, "delivery", ref), "a repeat pays nothing").toBe(
      73,
    );
    expect(await seeds(max, -20, "search_party")).toBe(53);
    await expect(seeds(max, -500, "shop")).rejects.toThrow(
      /insufficient_seeds/,
    );
    const balance = await one<{ seeds: number }>(
      "select seeds from profiles where id = $1",
      [max],
    );
    expect(balance.seeds).toBe(53);
    const ledger = await one<{ n: number }>(
      "select coalesce(sum(delta), 0)::int as n from seed_ledger where user_id = $1",
      [max],
    );
    expect(ledger.n, "ledger adds up to the balance").toBe(53);
  });

  it("friendships are stored once per pair, smaller id first", async () => {
    const [a, b] = [max, priya].sort();
    const insert = "insert into friendships (a_id, b_id) values ($1, $2)";
    await db.query(insert, [a, b]);
    await expect(db.query(insert, [b, a])).rejects.toThrow(/check/);
    await expect(db.query(insert, [a, b])).rejects.toThrow(/duplicate|unique/);
  });

  it("a bird can only be on one active flight", async () => {
    const gerald = await bird(max);
    const first = (await fly(gerald, "flying")).id;
    await expect(fly(gerald, "flying")).rejects.toThrow(/duplicate|unique/);
    await expect(fly(gerald, "scheduled")).rejects.toThrow(/duplicate|unique/);
    await db.query(
      "update flights set status = 'landed', landed_at = now() where id = $1",
      [first],
    );
    await fly(gerald, "flying");
  });

  it("busy birds must say what they are busy with", async () => {
    await expect(
      db.query(
        "insert into birds (owner_id, name, speed_mph, focus, navigation, status) values ($1, 'Kevin', 38, 1, 2, 'busy')",
        [max],
      ),
    ).rejects.toThrow(/check/);
    await db.query(
      "insert into birds (owner_id, name, speed_mph, focus, navigation, status, busy_kind, busy_until) values ($1, 'Kevin', 38, 1, 2, 'busy', 'nap', now() + interval '30 minutes')",
      [max],
    );
  });

  it("notes: length limits", async () => {
    const insert =
      "insert into notes (sender_id, recipient_id, body) values ($1, $2, $3)";
    await expect(db.query(insert, [max, priya, ""])).rejects.toThrow(/check/);
    await expect(
      db.query(insert, [max, priya, "x".repeat(561)]),
    ).rejects.toThrow(/check/);
    await db.query(insert, [max, priya, "x".repeat(560)]);
  });

  it("one open egg per person; notifications and found objects cannot double up", async () => {
    await db.query(
      "insert into eggs (user_id, hatch_at_delivery) values ($1, 5)",
      [max],
    );
    await expect(
      db.query(
        "insert into eggs (user_id, hatch_at_delivery) values ($1, 30)",
        [max],
      ),
    ).rejects.toThrow(/duplicate|unique/);
    const ref = await uuid();
    const note = () =>
      db.query(
        "insert into notifications (user_id, kind, title, body, ref_id) values ($1, 'landed-in', 't', 'b', $2) on conflict do nothing returning id",
        [priya, ref],
      );
    expect(await note()).toHaveLength(1);
    expect(await note()).toHaveLength(0);
  });

  it("events: a signed-in user reads only their own rows", async () => {
    await db.query(
      "insert into events (user_id, kind) values ($1, 'flight'), ($2, 'flight')",
      [max, priya],
    );
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      max,
    ]);
    await db.query("set role authenticated");
    const rows = await db.query("select user_id from events");
    await expect(db.query("select * from profiles")).rejects.toThrow(
      /permission denied/,
    );
    await db.query("reset role");
    expect(rows).toEqual([{ user_id: max }]);
  });

  it("deleting an account removes everything that belongs to it", async () => {
    const [a, b] = [max, priya].sort();
    await db.query("insert into friendships (a_id, b_id) values ($1, $2)", [
      a,
      b,
    ]);
    const gerald = await bird(max);
    await fly(gerald, "flying");
    await db.query(
      "insert into notes (sender_id, recipient_id, body) values ($1, $2, 'coo')",
      [max, priya],
    );
    await seeds(max, 60, "welcome");
    await db.query(
      "insert into eggs (user_id, hatch_at_delivery) values ($1, 5)",
      [max],
    );
    await db.query("insert into events (user_id, kind) values ($1, 'flight')", [
      max,
    ]);
    for (const [table, where] of Object.entries(OWNED_BY)) {
      expect(await owned(table, where), table).toBeGreaterThan(0);
    }
    await db.query("delete from auth.users where id = $1", [max]);
    for (const [table, where] of Object.entries(OWNED_BY)) {
      expect(await owned(table, where), table).toBe(0);
    }
    const left = await one<{ n: number }>(
      "select count(*)::int as n from profiles",
    );
    expect(left.n).toBe(1);
  });
});
