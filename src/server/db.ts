import pg, { type Pool, type PoolClient } from "pg";
import { getEnv } from "@/env";
import { log } from "./log";
import { SUPABASE_ROOT_2021_CA } from "./certs/supabaseRoot2021";

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

type PoolTarget =
  | { kind: "local"; connectionString: string }
  | {
      kind: "remote";
      connectionString: string;
      ssl: { ca: string; rejectUnauthorized: true };
    };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const SSL_PARAMS = [
  "uselibpqcompat",
  "ssl",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslnegotiation",
];

function refuse(setting: string, hint = ""): never {
  throw new Error(
    `DATABASE_URL must not set ${setting}: TLS is always verified against the Supabase Root 2021 CA.${hint}`,
  );
}

function poolTarget(connectionString: string): PoolTarget {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (LOCAL_HOSTS.has(url.hostname) && !url.searchParams.has("host"))
    return { kind: "local", connectionString };

  for (const name of SSL_PARAMS) if (url.searchParams.has(name)) refuse(name);
  for (const mode of url.searchParams.getAll("sslmode")) {
    if (mode !== "verify-full")
      refuse(`sslmode=${mode}`, " Use sslmode=verify-full or leave it out.");
  }
  // pg replaces the ssl option wholesale with whatever sslmode implies, dropping the ca.
  url.searchParams.delete("sslmode");
  return {
    kind: "remote",
    connectionString: url.toString(),
    ssl: { ca: SUPABASE_ROOT_2021_CA, rejectUnauthorized: true },
  };
}

export function createPool(connectionString: string): Pool {
  const target = poolTarget(connectionString);
  return new pg.Pool({
    connectionString: target.connectionString,
    ssl: target.kind === "remote" ? target.ssl : undefined,
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
    pool.on("error", (err) => log.error("db.idle_client_failed", { err }));
    db = poolDb(pool);
  }
  return db;
}
