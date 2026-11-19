import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { TYPE_PARSERS, type Db } from "@/server/db";

const SUPABASE_ONLY = ["0002_cron.sql"];
const supabase = join(process.cwd(), "supabase");

async function buildTemplate(): Promise<Blob> {
  const pg = await PGlite.create();
  await pg.exec(readFileSync(join(supabase, "test/auth-stub.sql"), "utf8"));
  const migrations = join(supabase, "migrations");
  for (const file of readdirSync(migrations).sort()) {
    if (!file.endsWith(".sql") || SUPABASE_ONLY.includes(file)) continue;
    await pg.exec(readFileSync(join(migrations, file), "utf8"));
  }
  const dump = await pg.dumpDataDir("none");
  await pg.close();
  return dump;
}

let template: Promise<Blob> | undefined;

function txDb(t: Transaction): Db {
  const db: Db = {
    async query<T>(sql: string, params?: unknown[]) {
      return (await t.query<T>(sql, params)).rows;
    },
    tx: (fn) => fn(db),
  };
  return db;
}

export async function testDb(): Promise<Db> {
  template ??= buildTemplate();
  const pg = await PGlite.create({
    loadDataDir: await template,
    parsers: TYPE_PARSERS,
  });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      return (await pg.query<T>(sql, params)).rows;
    },
    tx: (fn) => pg.transaction((t) => fn(txDb(t))),
  };
}
