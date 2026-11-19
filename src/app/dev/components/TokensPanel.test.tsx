import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TokensPanel } from "./TokensPanel";

const tokensCss = readFileSync(
  new URL("../../../../public/assets/tokens.css", import.meta.url),
  "utf8",
);
const declared = (pattern: RegExp) =>
  [...tokensCss.matchAll(pattern)].map((m) => ({ name: m[1], value: m[2] }));

const colours = declared(/--coo-([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g);
const radii = declared(/--coo-radius-([a-z]+):\s*(\S+);/g);
const shadows = declared(/--coo-shadow-(\d):\s*([^;]+);/g);
const html = renderToStaticMarkup(<TokensPanel />);

describe("TokensPanel", () => {
  it("shows a swatch with its hex label for each of the fourteen colour tokens", () => {
    expect(colours).toHaveLength(14);
    for (const { name, value } of colours) {
      expect(html).toContain(`background:var(--coo-${name})`);
      expect(html).toContain(`--coo-${name}<`);
      expect(html).toContain(`>${value}<`);
    }
  });

  it("shows a sample for every radius and shadow token", () => {
    expect(radii.length).toBeGreaterThan(0);
    expect(shadows.length).toBeGreaterThan(0);
    for (const { name } of radii)
      expect(html).toContain(`border-radius:var(--coo-radius-${name})`);
    for (const { name } of shadows)
      expect(html).toContain(`box-shadow:var(--coo-shadow-${name})`);
  });

  it("shows the three type families", () => {
    for (const family of ["display", "body", "hand"]) {
      expect(html).toContain(`font-family:var(--coo-font-${family})`);
    }
  });

  it("colours every inline style through a token variable", () => {
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
    expect(styles.length).toBeGreaterThan(0);
    for (const style of styles)
      expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
