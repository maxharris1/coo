import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chromeFor } from "@/components/shell";
import { MORE_ROWS } from "./more";

const css = readFileSync(new URL("./More.module.css", import.meta.url), "utf8");

const rule = (name: string) =>
  css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))![1];

const value = (body: string, prop: string) =>
  body.match(new RegExp(`(?:^|\\s)${prop}: ([^;]+);`))?.[1];

describe("More layout", () => {
  it("keeps the tab bar, since Post office sits under the Loft tab", () => {
    expect(chromeFor("/more")).toBe("tabs");
  });

  it("lays the cards out in two equal columns", () => {
    expect(value(rule("grid"), "grid-template-columns")).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
    expect(value(rule("grid"), "gap")).toBe("12px");
  });

  it("makes each card the mock's 126px tall, well over a 44px target", () => {
    expect(value(rule("card"), "min-height")).toBe("126px");
  });

  it("stacks the Report a bug row under the grid at the page's full width", () => {
    expect(value(rule("page"), "flex-direction")).toBe("column");
    expect(value(rule("page"), "align-items")).toBeUndefined();
    expect(value(rule("report"), "width")).toBeUndefined();
    expect(value(rule("report"), "max-width")).toBeUndefined();
  });

  it("makes the Report a bug row at least a 44px target", () => {
    expect(value(rule("report"), "min-height")).toBe("var(--coo-touch)");
  });

  it("gives the back link a 44px circle", () => {
    for (const prop of ["width", "height"]) {
      expect(value(rule("back"), prop), prop).toBe("var(--coo-touch)");
    }
  });

  it("lets long titles and lines wrap instead of clipping at 360px", () => {
    for (const name of ["title", "sub", "reportText"]) {
      expect(value(rule(name), "overflow-wrap"), name).toBe("anywhere");
      expect(value(rule(name), "white-space"), name).toBeUndefined();
    }
  });

  it("colours each icon tile with its tone's token", () => {
    for (const { tone } of MORE_ROWS) {
      expect(value(rule(tone), "background"), tone).toBe(`var(--coo-${tone})`);
    }
  });
});
