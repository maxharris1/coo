import { readFileSync } from "node:fs";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { inject } from "vitest";
import { TYPE_PARSERS, type Db } from "@/server/db";

let template: Blob | undefined;

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
  template ??= new Blob([readFileSync(inject("pgTemplate"))]);
  const pg = await PGlite.create({
    loadDataDir: template,
    parsers: TYPE_PARSERS,
  });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      return (await pg.query<T>(sql, params)).rows;
    },
    tx: (fn) => pg.transaction((t) => fn(txDb(t))),
  };
}

export function asRole(db: Db, role: "coo_app"): Db {
  const tx: Db["tx"] = (fn) =>
    db.tx(async (t) => {
      await t.query(`set local role ${role}`);
      return fn(t);
    });
  return {
    query: <T>(sql: string, params?: unknown[]) =>
      tx((t) => t.query<T>(sql, params)),
    tx,
  };
}
