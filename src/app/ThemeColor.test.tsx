import { readFileSync } from "node:fs";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import RootLayout, { viewport } from "./layout";
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

const TRACKER_TOP = readFileSync(
  "src/components/Tracker.module.css",
  "utf8",
).match(/^\.tracker \{[^}]*?background: (#[0-9a-fA-F]{6});/m)![1];

function page(path: string) {
  const viewportTags = () => [
    { media: "(prefers-color-scheme: light)", content: config.app.themeColor },
    { media: "(prefers-color-scheme: dark)", content: config.app.themeColor },
  ];
  let metas = viewportTags();
  const head = {};
  const documentElement = { dataset: {} as Record<string, string> };
  const observers: (() => void)[] = [];
  vi.stubGlobal("document", {
    documentElement,
    head,
    querySelectorAll: (selector: string) =>
      selector === 'meta[name="theme-color"]' ? metas : [],
  });
  vi.stubGlobal("getComputedStyle", (element: unknown) => ({
    getPropertyValue: (token: string) =>
      element === documentElement ? (TOKENS[token] ?? "") : "",
  }));
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(private readonly notify: () => void) {}
      observe(target: unknown) {
        if (target === head) observers.push(this.notify);
      }
      disconnect() {}
    },
  );
  nav.path = path;
  expect(ThemeColor()).toBeNull();
  return {
    colours: () => metas.map(({ content }) => content),
    canvas: () => documentElement.dataset.canvas,
    replaceViewport: () => {
      metas = viewportTags();
      observers.forEach((notify) => notify());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("theme colour", () => {
  it.each([
    ["/", "#A9DDF7"],
    ["/sill/v1/takeoff", "#A9DDF7"],
    ["/shop", "#F4623F"],
    ["/sign-in", "#FFC93C"],
    ["/settings", "#FFF4DC"],
  ])("paints the status bar on %s in the page's top colour", (path, hex) => {
    expect(page(path).colours()).toEqual([hex, hex]);
  });

  it("paints the flight tracker in the day tracker's top colour", () => {
    expect(TRACKER_TOP).toBe("#d4ebb0");
    expect(page("/flights/f1").colours()).toEqual([TRACKER_TOP, TRACKER_TOP]);
  });

  it("keeps the page colour when a query-only navigation replaces the viewport tags", () => {
    const shoebox = page("/shoebox");
    expect(shoebox.colours()).toEqual(["#FFF4DC", "#FFF4DC"]);
    shoebox.replaceViewport();
    expect(shoebox.colours()).toEqual(["#FFF4DC", "#FFF4DC"]);
  });

  it.each([
    ["/welcome", "sun"],
    ["/sign-in", "sun"],
    ["/welcome/install", "sky"],
    ["/", "paper"],
    ["/shop", "paper"],
  ])("marks the canvas behind %s as %s", (path, canvas) => {
    expect(page(path).canvas()).toBe(canvas);
  });

  it("ships a theme colour for both the light and the dark scheme", () => {
    expect(viewport.themeColor).toEqual(
      expect.arrayContaining([
        {
          media: "(prefers-color-scheme: light)",
          color: config.app.themeColor,
        },
        { media: "(prefers-color-scheme: dark)", color: config.app.themeColor },
      ]),
    );
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
