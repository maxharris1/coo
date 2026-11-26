import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { Db } from "@/server/db";
import { asRole, testDb } from "@/test/testDb";

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
  bug_reports: "user_id = $1",
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
      "select tablename, policyname, roles from pg_policies where schemaname = 'public' order by tablename, policyname",
    );
    expect(pol).toEqual([
      {
        tablename: "bug_reports",
        policyname: "bug_reports_app_insert",
        roles: ["coo_app"],
      },
      {
        tablename: "bug_reports",
        policyname: "bug_reports_app_read",
        roles: ["coo_app"],
      },
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

  it("guest_links_for_phone is a definer function only coo_app may run, and it returns no phone", async () => {
    const fn = "public.guest_links_for_phone(uuid)";
    const privileges = await one(
      `select has_function_privilege('coo_app', $1, 'execute') as app,
              has_function_privilege('anon', $1, 'execute') as anon,
              has_function_privilege('authenticated', $1, 'execute') as authenticated,
              exists (
                select from pg_proc p, aclexplode(p.proacl) a
                 where p.oid = $1::regprocedure and a.grantee = 0
              ) as public`,
      [fn],
    );
    expect(privileges).toEqual({
      app: true,
      anon: false,
      authenticated: false,
      public: false,
    });
    expect(
      await one(
        "select prosecdef, proconfig from pg_proc where oid = $1::regprocedure",
        [fn],
      ),
    ).toEqual({ prosecdef: true, proconfig: ['search_path=""'] });
    for (const role of ["anon", "authenticated"])
      await expect(
        db.tx(async (t) => {
          await t.query(`set local role ${role}`);
          await t.query("select * from public.guest_links_for_phone($1)", [
            max,
          ]);
        }),
      ).rejects.toThrow(/permission denied/);

    await db.query(
      "update auth.users set phone = '15550000001' where id = $1",
      [priya],
    );
    const { id: link } = await one<{ id: string }>(
      `insert into guest_links (token_hash, sender_id, recipient_name, dest_lat, dest_lon, dest_label, notify_phone)
       values ('h', $1, 'Priya', 39.95, -75.17, 'Philadelphia', '+1 555-000-0001') returning id`,
      [max],
    );
    const rows = await asRole(db, "coo_app").query(
      "select * from public.guest_links_for_phone($1)",
      [priya],
    );
    expect(rows).toEqual([{ id: link, sender_id: max }]);
  });

  it("lock_auth_user is a definer function only coo_app may run, and it says whether the user exists", async () => {
    const fn = "public.lock_auth_user(uuid)";
    const privileges = await one(
      `select has_function_privilege('coo_app', $1, 'execute') as app,
              has_function_privilege('anon', $1, 'execute') as anon,
              has_function_privilege('authenticated', $1, 'execute') as authenticated,
              exists (
                select from pg_proc p, aclexplode(p.proacl) a
                 where p.oid = $1::regprocedure and a.grantee = 0
              ) as public`,
      [fn],
    );
    expect(privileges).toEqual({
      app: true,
      anon: false,
      authenticated: false,
      public: false,
    });
    expect(
      await one(
        "select prosecdef, proconfig from pg_proc where oid = $1::regprocedure",
        [fn],
      ),
    ).toEqual({ prosecdef: true, proconfig: ['search_path=""'] });
    for (const role of ["anon", "authenticated"])
      await expect(
        db.tx(async (t) => {
          await t.query(`set local role ${role}`);
          await t.query("select public.lock_auth_user($1)", [max]);
        }),
      ).rejects.toThrow(/permission denied/);

    const app = asRole(db, "coo_app");
    expect(
      await app.query("select public.lock_auth_user($1) as live", [max]),
    ).toEqual([{ live: true }]);
    await db.query("delete from auth.users where id = $1", [priya]);
    expect(
      await app.query("select public.lock_auth_user($1) as live", [priya]),
    ).toEqual([{ live: false }]);
  });

  it("sms_phone is a definer function only coo_app may run, and it returns one user's phone", async () => {
    const fn = "public.sms_phone(uuid)";
    const privileges = await one(
      `select has_function_privilege('coo_app', $1, 'execute') as app,
              has_function_privilege('anon', $1, 'execute') as anon,
              has_function_privilege('authenticated', $1, 'execute') as authenticated,
              exists (
                select from pg_proc p, aclexplode(p.proacl) a
                 where p.oid = $1::regprocedure and a.grantee = 0
              ) as public,
              has_schema_privilege('coo_app', 'auth', 'usage') as auth_usage`,
      [fn],
    );
    expect(privileges).toEqual({
      app: true,
      anon: false,
      authenticated: false,
      public: false,
      auth_usage: false,
    });
    expect(
      await one(
        `select prosecdef, proconfig, proretset,
                pg_get_function_result(oid) as result,
                pg_get_function_identity_arguments(oid) as args
           from pg_proc where oid = $1::regprocedure`,
        [fn],
      ),
    ).toEqual({
      prosecdef: true,
      proconfig: ['search_path=""'],
      proretset: false,
      result: "text",
      args: "p_user uuid",
    });
    for (const role of ["anon", "authenticated"])
      await expect(
        db.tx(async (t) => {
          await t.query(`set local role ${role}`);
          await t.query("select public.sms_phone($1)", [max]);
        }),
      ).rejects.toThrow(/permission denied/);

    await db.query(
      "update auth.users set phone = '15550000001' where id = $1",
      [max],
    );
    await db.query(
      "update auth.users set phone = '15550000002' where id = $1",
      [priya],
    );
    const sam = await user("sam");
    const app = asRole(db, "coo_app");
    const phone = (id: string) =>
      app.query("select public.sms_phone($1) as phone", [id]);
    expect(await phone(max)).toEqual([{ phone: "15550000001" }]);
    expect(await phone(priya)).toEqual([{ phone: "15550000002" }]);
    expect(await phone(sam)).toEqual([{ phone: null }]);
    expect(await phone(await uuid())).toEqual([{ phone: null }]);
    await db.query("delete from auth.users where id = $1", [priya]);
    expect(await phone(priya)).toEqual([{ phone: null }]);
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

  it("notes: an empty body needs a doodle, and the doodle has a size cap", async () => {
    const insert =
      "insert into notes (sender_id, recipient_id, body, doodle) values ($1, $2, $3, $4)";
    const { width, height, maxPoints, maxStrokes, maxBytes } =
      config.game.notes.doodle;
    const dot = {
      v: 1,
      w: width,
      h: height,
      strokes: [{ color: "ink", width: "fine", points: [[1, 1]] }],
    };
    await expect(db.query(insert, [max, priya, "", null])).rejects.toThrow(
      /check/,
    );
    await expect(
      db.query(insert, [max, priya, "x".repeat(561), dot]),
    ).rejects.toThrow(/check/);
    await db.query(insert, [max, priya, "", dot]);
    await db.query(insert, [max, priya, "coo", dot]);

    const perStroke = Math.floor(maxPoints / maxStrokes);
    const largest = {
      ...dot,
      strokes: Array.from({ length: maxStrokes }, () => ({
        color: "tomato",
        width: "marker",
        points: Array.from({ length: perStroke }, () => [width, height]),
      })),
    };
    expect(JSON.stringify(largest).length).toBeLessThanOrEqual(maxBytes);
    await db.query(insert, [max, priya, "", largest]);

    const oversized = {
      ...dot,
      strokes: [
        {
          color: "ink",
          width: "fine",
          points: Array.from({ length: 20000 }, (_, i) => [i, i * 7919]),
        },
      ],
    };
    await expect(db.query(insert, [max, priya, "", oversized])).rejects.toThrow(
      /check/,
    );
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

  it("bug_reports: columns", async () => {
    const cols = await db.query(
      `select column_name, data_type, is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public' and table_name = 'bug_reports'
        order by ordinal_position`,
    );
    expect(cols).toEqual([
      {
        column_name: "id",
        data_type: "uuid",
        is_nullable: "NO",
        column_default: "gen_random_uuid()",
      },
      {
        column_name: "user_id",
        data_type: "uuid",
        is_nullable: "NO",
        column_default: null,
      },
      {
        column_name: "client_key",
        data_type: "uuid",
        is_nullable: "NO",
        column_default: null,
      },
      {
        column_name: "body",
        data_type: "text",
        is_nullable: "NO",
        column_default: null,
      },
      {
        column_name: "context",
        data_type: "jsonb",
        is_nullable: "NO",
        column_default: "'{}'::jsonb",
      },
      {
        column_name: "status",
        data_type: "text",
        is_nullable: "NO",
        column_default: "'new'::text",
      },
      {
        column_name: "issue_number",
        data_type: "integer",
        is_nullable: "YES",
        column_default: null,
      },
      {
        column_name: "triaged_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
        column_default: null,
      },
      {
        column_name: "created_at",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
        column_default: "now()",
      },
    ]);
  });

  it("bug_reports: no browser role may touch it", async () => {
    const privileges = await db.query<{
      role: string;
      privilege: string;
      granted: boolean;
    }>(
      `select r.role, p.privilege, has_table_privilege(r.role, 'public.bug_reports', p.privilege) as granted
         from (values ('anon'), ('authenticated')) r(role),
              (values ('select'), ('insert'), ('update'), ('delete')) p(privilege)`,
    );
    expect(privileges).toHaveLength(8);
    expect(privileges.filter((p) => p.granted)).toEqual([]);
    await db.query(
      "insert into bug_reports (user_id, client_key, body) values ($1, gen_random_uuid(), 'map froze')",
      [max],
    );
    await expect(
      db.tx(async (t) => {
        await t.query("select set_config('request.jwt.claim.sub', $1, true)", [
          max,
        ]);
        await t.query("set local role authenticated");
        await t.query("select * from bug_reports");
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("bug_reports: coo_app inserts and reads, and can never edit or delete", async () => {
    const app = asRole(db, "coo_app");
    const [row] = await app.query<{ id: string }>(
      "insert into bug_reports (user_id, client_key, body) values ($1, gen_random_uuid(), 'map froze') returning id",
      [max],
    );
    expect(
      await app.query(
        "select user_id, body, status from bug_reports where id = $1",
        [row.id],
      ),
    ).toEqual([{ user_id: max, body: "map froze", status: "new" }]);
    await expect(
      app.query("update bug_reports set body = 'edited' where id = $1", [
        row.id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      app.query("delete from bug_reports where id = $1", [row.id]),
    ).rejects.toThrow(/permission denied/);
    expect(await db.query("select body from bug_reports")).toEqual([
      { body: "map froze" },
    ]);
  });

  it("bug_reports: constraints", async () => {
    const insert = async (fields: Record<string, unknown>) => {
      const row = {
        user_id: max,
        client_key: await uuid(),
        body: "map froze",
        ...fields,
      };
      const names = Object.keys(row);
      return db.query(
        `insert into bug_reports (${names.join(", ")}) values (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
        Object.values(row),
      );
    };
    const now = new Date().toISOString();
    const refused: [string, Record<string, unknown>][] = [
      ["empty body", { body: "" }],
      ["whitespace-only body", { body: "   " }],
      ["2001-character body", { body: "x".repeat(2001) }],
      ["unknown status", { status: "open" }],
      ["triaged_at on a new row", { triaged_at: now }],
      ["triaged with no triaged_at", { status: "triaged" }],
      [
        "issue_number 0",
        { status: "triaged", triaged_at: now, issue_number: 0 },
      ],
      ["issue_number on a new row", { issue_number: 7 }],
      ["context that is not an object", { context: "[]" }],
      [
        "context over 2048 bytes",
        { context: JSON.stringify({ route: "x".repeat(3000) }) },
      ],
    ];
    for (const [name, fields] of refused)
      await expect(insert(fields), name).rejects.toThrow(/check constraint/);

    const key = await uuid();
    await insert({ client_key: key });
    await expect(
      insert({ client_key: key }),
      "second (user_id, client_key)",
    ).rejects.toThrow(/unique constraint/);
    await insert({ client_key: key, user_id: priya });
    await insert({ body: "x".repeat(2000) });
    await insert({ status: "triaged", triaged_at: now, issue_number: 844 });
    const rows = await db.query<{
      user_id: string;
      client_key: string;
      len: number;
    }>("select user_id, client_key, char_length(body) as len from bug_reports");
    expect(rows).toHaveLength(4);
    expect(
      rows
        .filter((r) => r.client_key === key)
        .map((r) => r.user_id)
        .sort(),
    ).toEqual([max, priya].sort());
    expect(rows.some((r) => r.len === 2000)).toBe(true);
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
    for (const reporter of [max, priya]) {
      await db.query(
        "insert into bug_reports (user_id, client_key, body) values ($1, gen_random_uuid(), 'the map froze')",
        [reporter],
      );
    }
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
    const kept = await one<{ n: number }>(
      "select count(*)::int as n from bug_reports where user_id = $1",
      [priya],
    );
    expect(kept.n).toBe(1);
  });
});
