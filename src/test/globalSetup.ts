import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { TestProject } from "vitest/node";

const SUPABASE_ONLY = ["0002_cron.sql"];

declare module "vitest" {
  export interface ProvidedContext {
    pgTemplate: string;
  }
}

async function buildTemplate(): Promise<Blob> {
  const supabase = join(process.cwd(), "supabase");
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

export default async function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), "coo-pg-template-"));
  const path = join(dir, "template.tar");
  writeFileSync(path, Buffer.from(await (await buildTemplate()).arrayBuffer()));
  project.provide("pgTemplate", path);
  return () => rmSync(dir, { recursive: true, force: true });
}
