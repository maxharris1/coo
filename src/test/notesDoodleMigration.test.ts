import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const SUPABASE = join(process.cwd(), "supabase");
const MIGRATIONS = join(SUPABASE, "migrations");
const DOODLE = "0006_notes_doodle.sql";
const read = (dir: string, file: string) =>
  readFileSync(join(dir, file), "utf8");

describe(`supabase/migrations/${DOODLE}`, () => {
  it("applies over existing notes and keeps every one of them", async () => {
    const pg = await PGlite.create();
    try {
      await pg.exec(read(join(SUPABASE, "test"), "auth-stub.sql"));
      const before = readdirSync(MIGRATIONS)
        .filter(
          (f) => f.endsWith(".sql") && f < DOODLE && f !== "0002_cron.sql",
        )
        .sort();
      for (const file of before) await pg.exec(read(MIGRATIONS, file));

      const {
        rows: [{ id }],
      } = await pg.query<{ id: string }>(
        "insert into auth.users default values returning id",
      );
      await pg.query(
        "insert into profiles (id, name, handle, invite_code) values ($1, 'max', 'max', 'max-abcd')",
        [id],
      );
      await pg.query(
        "insert into notes (sender_id, recipient_id, body) values ($1, $1, 'x'), ($1, $1, repeat('y', 560))",
        [id],
      );

      await pg.exec(read(MIGRATIONS, DOODLE));

      const { rows } = await pg.query<{ n: number; doodles: number }>(
        "select count(*)::int as n, count(doodle)::int as doodles from notes",
      );
      expect(rows).toEqual([{ n: 2, doodles: 0 }]);
    } finally {
      await pg.close();
    }
  });
});
