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

  it("paints the html canvas paper in the light scheme by default", () => {
    const rule = /^html \{([^}]*)\}/m.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/background:\s*var\(--coo-paper\)/);
    expect(rule).toMatch(/color-scheme:\s*light/);
  });

  it.each([
    ["sun", "--coo-sun"],
    ["sky", "--coo-sky"],
  ])(
    "fills html and body with the %s canvas on phone widths only",
    (canvas, token) => {
      const phone =
        /@media \(max-width: 430px\) \{((?:[^{}]*\{[^}]*\})*)\s*\}/.exec(
          css,
        )?.[1] ?? "";
      const selector = `html[data-canvas="${canvas}"]`;
      const rule = new RegExp(
        `${escape(selector)},\\s*${escape(selector)} body\\s*\\{([^}]*)\\}`,
      ).exec(phone)?.[1];
      expect(rule).toMatch(new RegExp(`background:\\s*var\\(${token}\\)`));
      expect(css.split(selector)).toHaveLength(3);
    },
  );

  it("keeps the body a paper column 430px wide on desktop", () => {
    const rule = /^body \{([^}]*)\}/m.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/max-width:\s*430px/);
    expect(rule).toMatch(/margin:\s*0 auto/);
    expect(rule).toMatch(/background:\s*var\(--coo-paper\)/);
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
