import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "coverage"]);
const TEXT = /\.(ts|tsx|mts|mjs|js|json|md|sql|css|html|svg|txt|py|yml)$/;

// Spelled backwards so this list does not put the names in the repo itself.
const BANNED = [
  "enieffac",
  "detanieffac",
  "enitocin",
  "llaredda",
  "eniacoc",
  "enimatehpma",
  "enimatehpmahtem",
  "linifadom",
  "nilatir",
  "etadinehplyhtem",
  "enirdehpe",
  "anaraug",
  "eniruat",
  "eninaeht",
  "esnavyv",
  "ligivorp",
  "enirdezneb",
  "enirdexed",
  "motark",
].map((word) => [...word].reverse().join(""));
const PATTERN = new RegExp(`\\b(${BANNED.join("|")})\\b`, "i");

function textFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return SKIP_DIRS.has(entry.name) ? [] : textFiles(path);
    return TEXT.test(entry.name) ? [path] : [];
  });
}

describe("no real drug names", () => {
  it("never names one in source, config, copy or docs", () => {
    const hits = textFiles(ROOT).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          PATTERN.test(line) ? [`${relative(ROOT, file)}:${i + 1}`] : [],
        ),
    );

    expect(hits).toEqual([]);
  });

  it("catches a banned word when one appears", () => {
    expect(PATTERN.test(`Flies on ${BANNED[0].toUpperCase()}`)).toBe(true);
    expect(PATTERN.test("Flies through the night (espresso).")).toBe(false);
  });
});
