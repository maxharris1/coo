import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const fontFaces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
const fontDir = new URL("../../public/assets/fonts/", import.meta.url);

describe("globals.css", () => {
  it("declares every packet font file once, with font-display swap", () => {
    const files = readdirSync(fontDir).filter((f) => f.endsWith(".woff2"));
    const urls = fontFaces.map((rule) => /url\("?([^")]+)"?\)/.exec(rule)?.[1]);

    expect(files).toHaveLength(7);
    expect(urls.sort()).toEqual(files.map((f) => `/assets/fonts/${f}`).sort());
    for (const rule of fontFaces) expect(rule).toMatch(/font-display:\s*swap/);
  });

  it("types no raw colour, only token variables", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it("draws the focus ring as a 3px tomato outline with a 2px offset", () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/outline:\s*3px solid var\(--coo-tomato\)/);
    expect(rule).toMatch(/outline-offset:\s*2px/);
  });
});
