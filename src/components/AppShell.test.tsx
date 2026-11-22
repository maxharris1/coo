import { readFileSync } from "node:fs";
import { useContext } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppLayout from "@/app/(app)/layout";
import { chromeFor } from "./shell";
import { SyncContext, type SyncState } from "./SyncProvider";
import { TabBar } from "./TabBar";
import { ToastProvider } from "./Toasts";
import type { SyncPayload } from "./sync";

const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

beforeEach(() => {
  nav.path = "/";
});

function Probe() {
  const sync = useContext(SyncContext);
  return <i>{sync ? "in sync provider" : "no sync provider"}</i>;
}

const page = (path: string) => {
  nav.path = path;
  return renderToStaticMarkup(
    <AppLayout>
      <Probe />
    </AppLayout>,
  );
};

const synced = (
  over: Partial<SyncState>,
  visits: unknown[] = [],
): SyncState => ({
  data: { visits } as unknown as SyncPayload,
  error: null,
  offsetMs: 0,
  refresh: () => {},
  ...over,
});

describe("(app) shell", () => {
  it("wraps app pages in the sync provider, toasts and the tab bar", () => {
    const html = page("/flights");
    expect(html).toContain("in sync provider");
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<nav aria-label="Main"/);
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)];
    expect(links.map((m) => m[1])).toEqual([
      "/",
      "/flights",
      "/send",
      "/sill",
      "/shop",
    ]);
    expect(links.map((m) => m[2].replace(/<[^>]+>/g, ""))).toEqual([
      "Loft",
      "Flights",
      "",
      "Sill",
      "Seeds",
    ]);
    expect(links[2][0]).toContain('aria-label="Send a pigeon"');
    expect(links[1][0]).toContain('aria-current="page"');
    expect(links[0][0]).not.toContain("aria-current");
  });

  it("renders onboarding under /welcome bare", () => {
    for (const path of ["/welcome/install", "/welcome/bird", "/welcome/loft"]) {
      const html = page(path);
      expect(html, path).toBe("<i>no sync provider</i>");
    }
  });

  it.each([
    ["/send/write", "Compose"],
    ["/send/forecast", "Forecast"],
    ["/send/takeoff/f1", "Takeoff"],
    ["/send/share/f1", "ShareLink"],
    ["/sill/v1", "Landed"],
    ["/sill/v1/reply", "Reply"],
    ["/sill/v1/takeoff", "TakeoffHome"],
    ["/flights/f1/incident", "Incident report"],
  ])("hides the tab bar on %s (%s) but keeps the provider", (path) => {
    const html = page(path);
    expect(html).toContain("in sync provider");
    expect(html).not.toContain("<nav");
  });

  it("keeps the tab bar on the tab roots and other app pages", () => {
    for (const path of [
      "/",
      "/flights",
      "/flights/f1",
      "/send",
      "/send/new",
      "/sill",
      "/shop",
      "/more",
      "/birds/b1",
    ]) {
      expect(chromeFor(path), path).toBe("tabs");
    }
  });
});

describe("tab bar", () => {
  const bar = (state: SyncState) =>
    renderToStaticMarkup(
      <SyncContext.Provider value={state}>
        <TabBar />
      </SyncContext.Provider>,
    );

  it("puts a dot on Sill when a bird is waiting", () => {
    expect(bar(synced({}, [{ id: "v1" }]))).toContain(", a bird is waiting");
    expect(bar(synced({}, []))).not.toContain("a bird is waiting");
    expect(bar(synced({ data: null }))).not.toContain("a bird is waiting");
  });

  it("gives every tab a target of at least 44 px", () => {
    const css = readFileSync(
      new URL("./TabBar.module.css", import.meta.url),
      "utf8",
    );
    const rule = (name: string) =>
      css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))![1];
    const px = (body: string, prop: string) =>
      Number(body.match(new RegExp(`(?:^|\\s)${prop}: (\\d+)px`))![1]);
    for (const name of ["tab", "send"]) {
      const body = rule(name);
      expect(px(body, "width"), name).toBeGreaterThanOrEqual(44);
      expect(
        px(body, name === "tab" ? "min-height" : "height"),
        name,
      ).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("toasts", () => {
  it("shows the API's message when sync fails", () => {
    const html = renderToStaticMarkup(
      <SyncContext.Provider
        value={synced({ error: "Finish setting up your loft first." })}
      >
        <ToastProvider>page</ToastProvider>
      </SyncContext.Provider>,
    );
    expect(html).toMatch(
      /<div role="status"[^>]*><p[^>]*>Finish setting up your loft first\.<\/p><\/div>/,
    );
  });
});
