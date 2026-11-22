import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chromeFor } from "@/components/shell";

const css = readFileSync(
  new URL("./Forecast.module.css", import.meta.url),
  "utf8",
);

const rule = (name: string) =>
  css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))![1];

const value = (body: string, prop: string) =>
  body.match(new RegExp(`(?:^|\\s)${prop}: ([^;]+);`))?.[1];

const tokens = readFileSync(
  new URL("../../../../../assets/tokens.css", import.meta.url),
  "utf8",
);

const token = (name: string) =>
  tokens.match(new RegExp(`${name}: ([^;]+);`))![1];

const px = (declared: string) =>
  parseFloat(declared.replace(/var\((--[\w-]+)\)/, (_, name) => token(name)));

const outerSize = (name: string, axis: "width" | "height") => {
  const body = rule(name);
  const border =
    value(body, "box-sizing") === "content-box"
      ? 2 * px(value(body, "border") ?? "0")
      : 0;
  return px(value(body, axis)!) + border;
};

describe("Forecast layout", () => {
  it("fills the whole viewport, since the shell hides the tab bar here", () => {
    expect(chromeFor("/send/forecast")).toBe("full");
    expect(value(rule("screen"), "min-height")).toBe("100dvh");
  });

  it("pins the two buttons to the bottom of the screen", () => {
    expect(value(rule("footer"), "margin-top")).toBe("auto");
  });

  it("fits five hour chips across at any phone width", () => {
    expect(value(rule("chips"), "grid-template-columns")).toBe(
      "repeat(5, minmax(0, 1fr))",
    );
  });

  it("keeps every tap target at least 44 px", () => {
    expect(value(rule("back"), "width")).toBe("var(--coo-touch)");
    expect(value(rule("chip"), "min-height")).toBe("58px");
    expect(value(rule("secondary"), "min-height")).toBe("var(--coo-touch)");
  });

  it("sets the display face only at its one 400 weight", () => {
    const displayRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => body.includes("var(--coo-font-display)"))
      .map(([, selector, body]) => [
        selector.trim(),
        value(body, "font-weight"),
      ]);
    expect(displayRules.length).toBeGreaterThan(0);
    expect(displayRules).toEqual(
      displayRules.map(([selector]) => [selector, "400"]),
    );
  });

  it("keeps the reference's outer size for bordered boxes", () => {
    expect({
      back: [outerSize("back", "width"), outerSize("back", "height")],
      factorTile: [
        outerSize("factorTile", "width"),
        outerSize("factorTile", "height"),
      ],
    }).toEqual({ back: [49, 49], factorTile: [44, 44] });
  });
});
