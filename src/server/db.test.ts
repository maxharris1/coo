import { beforeEach, describe, expect, it } from "vitest";
import type { PoolClient, QueryConfig } from "pg";
import { createPool, poolDb, type Db, type PoolLike } from "./db";
import { testDb } from "@/test/testDb";

describe("testDb tx", () => {
  let db: Db;
  const count = async (d: Db) =>
    (await d.query<{ n: number }>("select count(*) as n from t"))[0].n;

  beforeEach(async () => {
    db = await testDb();
    await db.query("create table t (n int)");
  });

  it("commits when fn returns", async () => {
    const out = await db.tx(async (t) => {
      await t.query("insert into t values (1)");
      return "done";
    });
    expect(out).toBe("done");
    expect(await count(db)).toBe(1);
  });

  it("rolls back and rethrows when fn throws", async () => {
    await expect(
      db.tx(async (t) => {
        await t.query("insert into t values (1)");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await count(db)).toBe(0);
  });

  it("a nested tx joins the outer one and does not commit early", async () => {
    await expect(
      db.tx(async (t) => {
        await t.tx(async (inner) => {
          await inner.query("insert into t values (1)");
        });
        expect(await count(t)).toBe(1);
        throw new Error("outer fails after inner returned");
      }),
    ).rejects.toThrow("outer fails");
    expect(await count(db)).toBe(0);
  });

  it("refuses queries on a handle after its tx ended", async () => {
    let leaked: Db | undefined;
    await db.tx(async (t) => {
      leaked = t;
    });
    await expect(leaked!.query("select 1")).rejects.toThrow();
  });

  it("parses numeric, int8, timestamptz, date and arrays the same as production", async () => {
    const [row] = await db.query<Record<string, unknown>>(
      "select 1.5::numeric as num, 9::int8 as big, now() as ts, '2026-11-19'::date as day, array['a','b'] as arr",
    );
    expect(row).toEqual({
      num: 1.5,
      big: 9,
      ts: expect.any(Date),
      day: "2026-11-19",
      arr: ["a", "b"],
    });
  });
});

type Call = string | QueryConfig;

function fakePool(opts: { failOn?: string } = {}) {
  const calls: Call[] = [];
  const releases: (boolean | Error | undefined)[] = [];
  const run = async (q: Call, values?: unknown[]) => {
    calls.push(typeof q === "string" ? q : { ...q });
    const text = typeof q === "string" ? q : q.text;
    if (opts.failOn && text.startsWith(opts.failOn)) throw new Error(`${text} failed`);
    return { rows: [{ text, values }] };
  };
  const client = {
    query: run,
    release: (err?: boolean | Error) => releases.push(err),
  } as unknown as PoolClient;
  const pool: PoolLike = {
    query: run as PoolLike["query"],
    connect: async () => client,
  };
  const texts = () => calls.map((c) => (typeof c === "string" ? c : c.text));
  return { pool, calls, releases, texts };
}

describe("poolDb", () => {
  it("wraps fn in BEGIN and COMMIT on one client and releases it", async () => {
    const f = fakePool();
    const out = await poolDb(f.pool).tx(async (t) => {
      await t.query("insert 1", [1]);
      return 7;
    });
    expect(out).toBe(7);
    expect(f.texts()).toEqual(["BEGIN", "insert 1", "COMMIT"]);
    expect(f.releases).toEqual([undefined]);
  });

  it("sends one BEGIN and one COMMIT when tx is nested", async () => {
    const f = fakePool();
    await poolDb(f.pool).tx(async (t) => {
      await t.tx(async (inner) => {
        await inner.query("insert 1");
      });
      await t.query("insert 2");
    });
    expect(f.texts()).toEqual(["BEGIN", "insert 1", "insert 2", "COMMIT"]);
  });

  it("rolls back, releases and rethrows when fn throws", async () => {
    const f = fakePool();
    await expect(
      poolDb(f.pool).tx(async (t) => {
        await t.query("insert 1");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(f.texts()).toEqual(["BEGIN", "insert 1", "ROLLBACK"]);
    expect(f.releases).toEqual([undefined]);
  });

  it("destroys the client when ROLLBACK itself fails", async () => {
    const f = fakePool({ failOn: "ROLLBACK" });
    await expect(
      poolDb(f.pool).tx(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(f.releases).toEqual([true]);
  });

  it("refuses queries on a handle after its tx ended", async () => {
    const f = fakePool();
    let leaked: Db | undefined;
    await poolDb(f.pool).tx(async (t) => {
      leaked = t;
    });
    await expect(leaked!.query("select 1")).rejects.toThrow();
    expect(f.texts()).toEqual(["BEGIN", "COMMIT"]);
  });

  it("passes params through and never names a statement", async () => {
    const f = fakePool();
    const db = poolDb(f.pool);
    const rows = await db.query<{ values: unknown[] }>("select $1", [3]);
    expect(rows[0].values).toEqual([3]);
    await db.tx((t) => t.query("select $1", [4]));
    for (const c of f.calls) {
      if (typeof c !== "string") expect(c).not.toHaveProperty("name");
    }
  });
});

describe("createPool", () => {
  it("keeps the pool at 5 connections and parses types like the test db", async () => {
    const pool = createPool("postgres://user@localhost:1/none");
    expect(pool.options.max).toBe(5);
    const parse = (oid: number) =>
      pool.options.types!.getTypeParser(oid, "text") as (s: string) => unknown;
    expect(parse(1700)("1.5")).toBe(1.5);
    expect(parse(20)("9")).toBe(9);
    expect(() => parse(20)("9007199254740993")).toThrow();
    expect(parse(1082)("2026-11-19")).toBe("2026-11-19");
    expect(parse(1184)("2026-11-19 12:00:00+00")).toEqual(
      new Date("2026-11-19T12:00:00Z"),
    );
    await pool.end();
  });
});
