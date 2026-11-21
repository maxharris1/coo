import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");
const TICK = join(SRC, "server/services/tick.ts");
const IMPORT =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  const candidates = [".ts", ".tsx", "/index.ts", "/index.tsx"].map(
    (ext) => base + ext,
  );
  return candidates.find((c) => existsSync(c)) ?? null;
}

function runtimeImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(IMPORT)]
    .map((m) => resolveImport(file, m[1]))
    .filter((f): f is string => f !== null);
}

function cycleBackTo(start: string): string[] | null {
  const seen = new Set<string>();
  const walk = (file: string, path: string[]): string[] | null => {
    for (const next of runtimeImports(file)) {
      if (next === start) return [...path, next];
      if (seen.has(next)) continue;
      seen.add(next);
      const found = walk(next, [...path, next]);
      if (found) return found;
    }
    return null;
  };
  return walk(start, [start]);
}

describe("the tick module's imports", () => {
  it("never import the tick module back, so a mock of tick reaches every caller", () => {
    const cycle = cycleBackTo(TICK);
    expect(cycle?.map((f) => relative(SRC, f))).toBeUndefined();
  });
});
