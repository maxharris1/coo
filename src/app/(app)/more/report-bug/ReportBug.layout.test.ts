import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("./ReportBug.module.css", import.meta.url),
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

describe("ReportBug layout", () => {
  it("fills the whole viewport", () => {
    expect(value(rule("screen"), "min-height")).toBe("100dvh");
  });

  it("gives the back link a 44 px target that never shrinks", () => {
    const back = rule("back");
    expect(px(value(back, "width"))).toBeGreaterThanOrEqual(44);
    expect(px(value(back, "min-height"))).toBeGreaterThanOrEqual(44);
    expect(value(back, "flex-shrink")).toBe("0");
  });

  it("gives the button a tap target of at least 44 px", () => {
    expect(px(value(rule("button"), "min-height"))).toBeGreaterThanOrEqual(44);
  });

  it("grows the textarea with its text from a minimum height", () => {
    const text = rule("text");
    expect(value(text, "field-sizing")).toBe("content");
    expect(px(value(text, "min-height"))).toBeGreaterThan(0);
  });

  it("takes every colour from the tokens", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\b(?:rgb|hsl)a?\(/i);
  });

  it.each([
    "heading",
    "lead",
    "label",
    "text",
    "small",
    "error",
    "button",
    "sentHeading",
  ])("wraps long words in .%s instead of clipping", (name) => {
    expect(value(rule(name), "overflow-wrap")).toBe("anywhere");
  });
});
