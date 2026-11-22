import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chromeFor } from "@/components/shell";

const css = readFileSync(
  new URL("./ShareLink.module.css", import.meta.url),
  "utf8",
);

const rule = (name: string) =>
  css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))![1];

const value = (body: string, prop: string) =>
  body.match(new RegExp(`(?:^|\\s)${prop}: ([^;]+);`))?.[1];

describe("ShareLink layout", () => {
  it("fills the whole viewport, since the shell hides the tab bar here", () => {
    expect(chromeFor("/send/share/f1")).toBe("full");
    expect(value(rule("screen"), "min-height")).toBe("100dvh");
  });

  it("pins the watch link to the bottom of the screen", () => {
    expect(value(rule("watch"), "margin-top")).toBe("auto");
  });

  it("keeps every tap target at least 44px tall", () => {
    for (const name of ["text", "action", "watch"]) {
      expect(
        parseFloat(value(rule(name), "min-height")!),
        name,
      ).toBeGreaterThanOrEqual(44);
    }
  });
});
