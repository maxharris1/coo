import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chromeFor } from "@/components/shell";

const css = readFileSync(
  new URL("./Incident.module.css", import.meta.url),
  "utf8",
);

const rule = (name: string) =>
  css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))![1];

const value = (body: string, prop: string) =>
  body.match(new RegExp(`(?:^|\\s)${prop}: ([^;]+);`))?.[1];

const px = (v: string | undefined) => {
  const tokens: Record<string, number> = { "var(--coo-touch)": 44 };
  return v === undefined ? 0 : (tokens[v] ?? parseFloat(v));
};

describe("Incident layout", () => {
  it("fills the whole viewport, since the shell hides the tab bar here", () => {
    expect(chromeFor("/flights/x/incident")).toBe("full");
    expect(value(rule("screen"), "min-height")).toBe("100dvh");
  });

  it("gives the back link a 44 px target that never shrinks", () => {
    const back = rule("back");
    expect(px(value(back, "width"))).toBeGreaterThanOrEqual(44);
    expect(px(value(back, "min-height"))).toBeGreaterThanOrEqual(44);
    expect(value(back, "flex-shrink")).toBe("0");
  });

  it("takes every colour from the tokens", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it.each(["headline", "sub", "value", "sign"])(
    "wraps long words in .%s instead of clipping",
    (name) => {
      expect(value(rule(name), "overflow-wrap")).toBe("anywhere");
    },
  );
});
