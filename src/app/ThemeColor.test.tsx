import { readFileSync } from "node:fs";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
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

const TRACKER_TOP = readFileSync(
  "src/components/Tracker.module.css",
  "utf8",
).match(/^\.tracker \{[^}]*?background: (#[0-9a-fA-F]{6});/m)![1];

function page(path: string) {
  let meta = { content: config.app.themeColor };
  const head = {};
  const documentElement = {};
  const observers: (() => void)[] = [];
  vi.stubGlobal("document", {
    documentElement,
    head,
    querySelector: (selector: string) =>
      selector === 'meta[name="theme-color"]' ? meta : null,
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
    colour: () => meta.content,
    replaceViewport: () => {
      meta = { content: config.app.themeColor };
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
    expect(page(path).colour()).toBe(hex);
  });

  it("paints the flight tracker in the day tracker's top colour", () => {
    expect(TRACKER_TOP).toBe("#d4ebb0");
    expect(page("/flights/f1").colour()).toBe(TRACKER_TOP);
  });

  it("keeps the page colour when a query-only navigation replaces the viewport tags", () => {
    const shoebox = page("/shoebox");
    expect(shoebox.colour()).toBe("#FFF4DC");
    shoebox.replaceViewport();
    expect(shoebox.colour()).toBe("#FFF4DC");
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
