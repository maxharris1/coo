import pg, { type Pool, type PoolClient } from "pg";
import { getEnv } from "@/env";

export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

function int8(text: string): number {
  const n = Number(text);
  if (!Number.isSafeInteger(n))
    throw new RangeError(`int8 ${text} is not a safe integer`);
  return n;
}

export const TYPE_PARSERS: Record<number, (text: string) => unknown> = {
  20: int8,
  1700: Number,
  1082: String,
};

export type PoolLike = Pick<Pool, "query" | "connect">;

function clientDb(client: PoolClient): { db: Db; end: () => void } {
  let open = true;
  const db: Db = {
    async query<T>(sql: string, params?: unknown[]) {
      if (!open) throw new Error("query on a transaction that has ended");
      return (await client.query(sql, params)).rows as T[];
    },
    tx: (fn) => fn(db),
  };
  return { db, end: () => (open = false) };
}

export function poolDb(pool: PoolLike): Db {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      return (await pool.query(sql, params)).rows as T[];
    },
    async tx(fn) {
      const client = await pool.connect();
      const handle = clientDb(client);
      try {
        await client.query("BEGIN");
        const out = await fn(handle.db);
        const commit = await client.query("COMMIT");
        if (commit.command === "ROLLBACK") {
          throw new Error("transaction was rolled back instead of committed");
        }
        handle.end();
        client.release();
        return out;
      } catch (err) {
        handle.end();
        try {
          await client.query("ROLLBACK");
          client.release();
        } catch {
          client.release(true);
        }
        throw err;
      }
    },
  };
}

export function createPool(connectionString: string): Pool {
  return new pg.Pool({
    connectionString,
    max: 5,
    types: {
      getTypeParser: ((oid: number, format?: "text" | "binary") =>
        TYPE_PARSERS[oid] ??
        pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
    },
  });
}

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    const pool = createPool(getEnv().DATABASE_URL);
    pool.on("error", (err) =>
      console.error("idle database client failed", err.message),
    );
    db = poolDb(pool);
  }
  return db;
}
