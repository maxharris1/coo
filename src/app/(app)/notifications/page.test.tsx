import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { NotificationItem } from "@/server/services/notifications";
import type { NotificationsViewProps } from "./NotificationsView";
import NotificationsPage from "./page";

const view = vi.hoisted(() => ({
  props: null as NotificationsViewProps | null,
  toasts: [] as string[],
  toast: (message: string) => void view.toasts.push(message),
}));

vi.mock("./NotificationsView", () => ({
  NotificationsView: (props: NotificationsViewProps) => {
    view.props = props;
    return null;
  },
}));

vi.mock("@/components/Toasts", () => ({
  useToast: () => view.toast,
}));

const NOW = Date.parse("2026-11-20T19:00:00Z");

const item = (id: string, title: string, read = false): NotificationItem => ({
  id,
  kind: "landed-in",
  title,
  body: "There is a note from Priya on your sill.",
  url: `/sill/${id}`,
  createdAt: NOW - 60_000,
  read,
});

const MINE = [item("n1", "Dumpling has landed"), item("n2", "Gerald is home", true)];

let listResponse: () => Response;
let readResponse: () => Response;
let events: string[];
let root: Root;

function fakeFetch(url: RequestInfo | URL, init?: RequestInit) {
  const method = init?.method ?? "GET";
  events.push(`${method} ${String(url)}`);
  if (String(url) === "/api/notifications" && method === "GET") {
    return Promise.resolve(listResponse());
  }
  if (String(url) === "/api/notifications/read" && method === "POST") {
    return Promise.resolve(readResponse());
  }
  return Promise.reject(new Error(`unexpected ${method} ${String(url)}`));
}

async function mount() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  root = createRoot(container);
  const sync = {
    data: {
      serverNow: NOW,
      unread: 1,
      me: { id: "me-1", timezone: "UTC" },
    } as unknown as SyncPayload,
    error: null,
    offsetMs: 0,
    refresh: () => void events.push("refresh"),
  } satisfies SyncState;
  await act(async () => {
    root.render(
      <SyncContext.Provider value={sync}>
        <NotificationsPage />
      </SyncContext.Provider>,
    );
  });
}

beforeEach(() => {
  events = [];
  view.props = null;
  view.toasts.length = 0;
  listResponse = () => Response.json({ notifications: MINE });
  readResponse = () => Response.json({ unread: 0 });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("/notifications (ac-3)", () => {
  it("lists the rows, marks them read, then resyncs so the bell drops to zero", async () => {
    await mount();
    expect(events).toEqual([
      "GET /api/notifications",
      "POST /api/notifications/read",
      "refresh",
    ]);
    expect(view.props?.state).toEqual({ kind: "ready", items: MINE });
  });

  it("shows exactly the rows the server returned for the session, and never names a user", async () => {
    await mount();
    const state = view.props?.state;
    if (state?.kind !== "ready") throw new Error("not ready");
    expect(state.items.map((n) => n.id)).toEqual(["n1", "n2"]);
    for (const [url, init] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).not.toMatch(/[?#]/);
      expect(init?.body ?? null).toBeNull();
    }
  });

  it("keeps the count when the list fails to load, and says why", async () => {
    listResponse = () =>
      Response.json(
        { error: { message: "The loft is busy." } },
        { status: 503 },
      );
    await mount();
    expect(events).toEqual(["GET /api/notifications"]);
    expect(view.props?.state).toEqual({ kind: "failed" });
    expect(view.toasts).toEqual(["The loft is busy."]);
  });

  it("still shows the rows when marking read fails, and does not resync", async () => {
    readResponse = () =>
      Response.json({ error: { message: "Try again." } }, { status: 500 });
    await mount();
    expect(events).toEqual([
      "GET /api/notifications",
      "POST /api/notifications/read",
    ]);
    expect(view.props?.state).toEqual({ kind: "ready", items: MINE });
    expect(view.toasts).toEqual(["Try again."]);
  });

  it("passes the reader's timezone to the view", async () => {
    await mount();
    expect(view.props?.timezone).toBe("UTC");
  });
});
