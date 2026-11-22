import { readFileSync } from "node:fs";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import day from "../../public/map/coo-day.style.json";
import RootLayout from "./layout";
import { ThemeColor } from "./ThemeColor";

const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void) => effect(),
}));

const TOKENS = Object.fromEntries(
  [
    ...readFileSync("public/assets/tokens.css", "utf8").matchAll(
      /(--coo-[a-z-]+):\s*(#[0-9A-Fa-f]{6})/g,
    ),
  ].map(([, name, hex]) => [name, ` ${hex}`]),
);

const LAND = day.layers.find((layer) => layer.id === "land")!.paint as {
  "background-color": string;
};

function page(path: string) {
  const meta = { content: "" };
  const documentElement = {};
  vi.stubGlobal("document", {
    documentElement,
    querySelector: (selector: string) =>
      selector === 'meta[name="theme-color"]' ? meta : null,
  });
  vi.stubGlobal("getComputedStyle", (element: unknown) => ({
    getPropertyValue: (token: string) =>
      element === documentElement ? (TOKENS[token] ?? "") : "",
  }));
  nav.path = path;
  expect(ThemeColor()).toBeNull();
  return meta.content;
}

afterEach(() => vi.unstubAllGlobals());

describe("theme colour", () => {
  it.each([
    ["/", "#A9DDF7"],
    ["/shop", "#F4623F"],
    ["/sign-in", "#FFC93C"],
    ["/settings", "#FFF4DC"],
  ])("paints the status bar on %s in the page's top colour", (path, hex) => {
    expect(page(path)).toBe(hex);
  });

  it("paints the flight tracker in the land colour of the day map", () => {
    expect(page("/flights/f1")).toBe(LAND["background-color"]);
  });

  it("is rendered by the root layout", () => {
    const html = RootLayout({ children: null }) as ReactElement<{
      children: ReactElement<{ children: ReactNode[] }>;
    }>;
    const body = html.props.children.props.children;
    expect(
      body.some((child) => (child as ReactElement)?.type === ThemeColor),
    ).toBe(true);
  });
});
