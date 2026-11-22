import { existsSync } from "node:fs";
import { beforeAll, describe, expect, inject, it } from "vitest";
import type { Db } from "@/server/db";
import { testDb } from "./testDb";

describe("testDb", () => {
  it("loads the migrated template that global setup built once for the run", async () => {
    expect(existsSync(inject("pgTemplate"))).toBe(true);
    const db = await testDb();
    expect(await db.query("select count(*)::int as n from dev_clock")).toEqual([
      { n: 1 },
    ]);
  });
});

describe("testDb lifetime", () => {
  let fromTest: Db | undefined;
  let fromFile: Db;

  beforeAll(async () => {
    fromFile = await testDb();
  });

  it("opens a database inside a test", async () => {
    fromTest = await testDb();
    expect(await fromTest.query("select 1 as n")).toEqual([{ n: 1 }]);
  });

  it("closes that database once the test that opened it ends", async () => {
    await expect(fromTest!.query("select 1 as n")).rejects.toThrow(/closed/i);
  });

  it("keeps a database opened in beforeAll for the rest of its file", async () => {
    expect(await fromFile.query("select 1 as n")).toEqual([{ n: 1 }]);
  });
});
