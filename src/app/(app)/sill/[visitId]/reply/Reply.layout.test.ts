import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chromeFor } from "@/components/shell";

const css = readFileSync(
  new URL("./Reply.module.css", import.meta.url),
  "utf8",
);

const rule = (name: string) =>
  css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))![1];

const value = (body: string, prop: string) =>
  body.match(new RegExp(`(?:^|\\s)${prop}: ([^;]+);`))?.[1];

describe("Reply layout", () => {
  it("fills the whole viewport, since the shell hides the tab bar here", () => {
    expect(chromeFor("/sill/v1/reply")).toBe("full");
    expect(value(rule("screen"), "min-height")).toBe("100dvh");
  });

  it("pins the release footer to the bottom of the screen", () => {
    expect(value(rule("footer"), "margin-top")).toBe("auto");
  });

  it("keeps every tap target at least 44px", () => {
    expect(value(rule("back"), "height")).toBe("var(--coo-touch)");
    expect(value(rule("instead"), "min-height")).toBe("var(--coo-touch)");
    expect(value(rule("release"), "min-height")).toBe("60px");
  });
});
