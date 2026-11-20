import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SKIPPED = new Set([".git", ".next", "node_modules", "coverage", "out"]);

function findCaseCollisions(root: string): string[][] {
  const collisions: string[][] = [];
  const walk = (dir: string) => {
    const byKey = new Map<string, Set<string>>();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      const stem = entry.isDirectory()
        ? entry.name
        : entry.name.replace(/(?<=.)\.[^.]+$/, "");
      const key = stem.toLowerCase();
      const spellings = byKey.get(key) ?? new Set<string>();
      spellings.add(join(relative(root, dir), stem));
      byKey.set(key, spellings);
    }
    for (const spellings of byKey.values()) {
      if (spellings.size > 1) collisions.push([...spellings].sort());
    }
  };
  walk(root);
  return collisions;
}

describe("case-only path collisions", () => {
  it("finds two module paths that differ only by letter case", () => {
    const root = mkdtempSync(join(tmpdir(), "case-collisions-"));
    mkdirSync(join(root, "components"));
    writeFileSync(join(root, "components", "Toasts.tsx"), "");
    writeFileSync(join(root, "components", "toasts.ts"), "");
    writeFileSync(join(root, "components", "motion.css"), "");
    writeFileSync(join(root, "components", "motion.json"), "");

    expect(findCaseCollisions(root)).toEqual([
      [join("components", "Toasts"), join("components", "toasts")],
    ]);
  });

  it("the repository has none", () => {
    expect(findCaseCollisions(process.cwd())).toEqual([]);
  });
});
