import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

describe("supabase migrations", () => {
  it("each have a unique version", () => {
    const versions = readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.split("_")[0]);

    expect(versions.length - new Set(versions).size).toBe(0);
  });
});
