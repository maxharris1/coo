import { existsSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
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
