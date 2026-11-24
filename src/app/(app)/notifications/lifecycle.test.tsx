import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncProvider, useSync } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { MainTop } from "../MainTop";
import NotificationsPage from "./page";

vi.mock("./NotificationsView", () => ({ NotificationsView: () => null }));
vi.mock("@/components/Toasts", () => {
  const toast = () => {};
  return { useToast: () => toast };
});

const NOW = Date.parse("2026-11-20T19:00:00Z");

type Held = { url: string; release: () => void };

let unread: number;
let holding: Set<string>;
let held: Held[];
let shown: SyncPayload | null;
let root: Root;

function reply(url: string, method: string): () => Response {
  if (url === "/api/sync") {
    const body = {
      serverNow: NOW,
      unread,
      birds: [],
      me: {
        id: "me-1",
        seeds: 240,
        timezone: "UTC",
        loft: null,
        perches: 3,
        hasBirdbath: false,
      },
      egg: null,
    };
    return () => Response.json(body);
  }
  if (url === "/api/notifications" && method === "GET") {
    return () => Response.json({ notifications: [] });
  }
  if (url === "/api/notifications/read" && method === "POST") {
    return () => {
      unread = 0;
      return Response.json({ unread: 0 });
    };
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const respond = reply(url, init?.method ?? "GET");
  if (!holding.has(url)) return Promise.resolve(respond());
  return new Promise<Response>((resolve) =>
    held.push({ url, release: () => resolve(respond()) }),
  );
}

async function release(url: string) {
  const i = held.findIndex((h) => h.url === url);
  if (i < 0) throw new Error(`nothing held for ${url}`);
  const [h] = held.splice(i, 1);
  await act(async () => h.release());
}

function Bell() {
  const { data } = useSync();
  useEffect(() => {
    shown = data;
  }, [data]);
  return null;
}

function bell() {
  if (!shown) throw new Error("no sync data yet");
  const html = renderToStaticMarkup(<MainTop data={shown} nowMs={NOW} />);
  return html.match(/<a[^>]*href="\/notifications"[^>]*>.*?<\/a>/s)![0];
}

async function show(page: "main" | "notifications") {
  await act(async () => {
    root.render(
      <SyncProvider>
        <Bell />
        {page === "notifications" && <NotificationsPage />}
      </SyncProvider>,
    );
  });
}

beforeEach(() => {
  unread = 3;
  holding = new Set();
  held = [];
  shown = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible" }),
  );
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: document,
  }) as unknown as Element;
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("marking notifications read zeroes the bell (ac-3)", () => {
  it("zeroes the bell after the read lands while Notifications is open", async () => {
    await show("main");
    expect(bell()).toContain('aria-label="Notifications, 3 unread"');
    await show("notifications");
    expect(bell()).toContain('aria-label="Notifications"');
    expect(bell()).not.toMatch(/<span[^>]*>3<\/span>/);
  });

  it("zeroes the bell when the read lands after navigating back to Main", async () => {
    await show("main");
    holding.add("/api/notifications/read");
    await show("notifications");
    expect(held.map((h) => h.url)).toEqual(["/api/notifications/read"]);
    await show("main");
    expect(bell()).toContain('aria-label="Notifications, 3 unread"');
    await release("/api/notifications/read");
    expect(bell(), "before the next poll").toContain(
      'aria-label="Notifications"',
    );
    expect(bell()).not.toMatch(/<span[^>]*>3<\/span>/);
  });

  it("zeroes the bell when a sync captured before the read lands after it", async () => {
    await show("main");
    holding.add("/api/sync");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(held.map((h) => h.url)).toEqual(["/api/sync"]);
    holding.delete("/api/sync");
    await show("notifications");
    expect(unread, "the read landed on the server").toBe(0);
    await release("/api/sync");
    expect(bell(), "before the next poll").toContain(
      'aria-label="Notifications"',
    );
    expect(bell()).not.toMatch(/<span[^>]*>3<\/span>/);
  });
});
