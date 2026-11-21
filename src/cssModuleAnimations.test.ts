import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL(".", import.meta.url).pathname;

const KEYWORDS = new Set([
  "none",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "linear",
  "step-start",
  "step-end",
  "infinite",
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
  "forwards",
  "backwards",
  "both",
  "running",
  "paused",
  "initial",
  "inherit",
  "unset",
]);

const modules = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".module.css"))
  .sort();

function animationsOf(css: string) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const defined = new Set(
    [...source.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]),
  );
  const used = [
    ...source.matchAll(/(?<![\w-])animation(?:-name)?\s*:\s*([^;}]+)/g),
  ].flatMap((m) =>
    m[1]
      .replace(/!important/g, "")
      .replace(/[\w-]+\([^)]*\)/g, " ")
      .split(/[\s,]+/)
      .filter(
        (token) =>
          token !== "" &&
          !KEYWORDS.has(token) &&
          !/^-?[\d.]+(m?s)?$/.test(token),
      ),
  );
  return { defined, used };
}

describe("CSS module animations", () => {
  it("finds animations to check", () => {
    const total = modules.flatMap(
      (path) => animationsOf(readFileSync(join(SRC, path), "utf8")).used,
    );
    expect(total.length).toBeGreaterThan(0);
  });

  it.each(modules)(
    "%s defines the keyframes for every animation it uses, since the compiler scopes the names",
    (path) => {
      const { defined, used } = animationsOf(
        readFileSync(join(SRC, path), "utf8"),
      );
      const missing = used.filter((name) => !defined.has(name));
      expect(missing, `${path} uses undefined keyframes`).toEqual([]);
    },
  );
});
