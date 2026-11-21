import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { NotificationItem } from "@/server/services/notifications";
import { RealtimeNudge } from "./RealtimeNudge";
import { SyncProvider } from "./SyncProvider";
import { ToastContext } from "./Toasts";

type Handler = (payload: { new: { kind: string } }) => void;
type Status = (status: string, err?: Error) => void;

const realtime = vi.hoisted(() => {
  const state = {
    accessToken: null as null | (() => Promise<string | null>),
    channels: [] as {
      name: string;
      bindings: { type: string; filter: unknown; handler: Handler }[];
      status: Status | undefined;
      channel: unknown;
    }[],
    removed: [] as unknown[],
  };
  const browserSupabase = (accessToken: () => Promise<string | null>) => {
    state.accessToken = accessToken;
    return {
      channel(name: string) {
        const record = {
          name,
          bindings: [] as { type: string; filter: unknown; handler: Handler }[],
          status: undefined as Status | undefined,
          channel: undefined as unknown,
        };
        state.channels.push(record);
        const channel = {
          on(type: string, filter: unknown, handler: Handler) {
            record.bindings.push({ type, filter, handler });
            return channel;
          },
          subscribe(status?: Status) {
            record.status = status;
            return channel;
          },
        };
        record.channel = channel;
        return channel;
      },
      removeChannel(channel: unknown) {
        state.removed.push(channel);
        return Promise.resolve("ok");
      },
    };
  };
  return { state, browserSupabase };
});
vi.mock("@/server/supabase/browser", () => ({
  browserSupabase: realtime.browserSupabase,
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let tokenResponse: () => Response;
let notifications: NotificationItem[];
let notificationsResponse: () => Response;
const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
  if (url === "/api/sync")
    return json(200, { serverNow: 0, me: { id: "user-1" } });
  if (url === "/api/realtime/token") return tokenResponse();
  if (url === "/api/notifications") return notificationsResponse();
  throw new Error(`unexpected fetch ${String(url)}`);
});
const calls = (path: string) =>
  fetch.mock.calls.filter(([url]) => url === path).length;
const syncCalls = () => calls("/api/sync");
const toast = vi.fn<(message: string) => void>();

const item = (over: Partial<NotificationItem>): NotificationItem => ({
  id: "n1",
  kind: "landed-in",
  title: "Pip landed in your loft",
  body: "",
  url: "/sill/v1",
  createdAt: 0,
  read: false,
  ...over,
});

let root: Root | null = null;

async function mount() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: document,
  }) as unknown as Element;
  const mounted = createRoot(container);
  root = mounted;
  await act(async () => {
    mounted.render(
      <SyncProvider>
        <ToastContext.Provider value={toast}>
          <RealtimeNudge />
        </ToastContext.Provider>
      </SyncProvider>,
    );
  });
}

const insertHandlers = () =>
  realtime.state.channels.flatMap((c) =>
    c.bindings.filter((b) => b.type === "postgres_changes"),
  );

const insert = (kind: string) =>
  act(async () => {
    insertHandlers()[0].handler({ new: { kind } });
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers();
  realtime.state.accessToken = null;
  realtime.state.channels = [];
  realtime.state.removed = [];
  tokenResponse = () => json(200, { token: "t" });
  notifications = [];
  notificationsResponse = () => json(200, { notifications });
  fetch.mockClear();
  toast.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible" }),
  );
  vi.stubGlobal("fetch", fetch);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("realtime nudge", () => {
  it("listens for new events rows for the signed-in user", async () => {
    await mount();
    expect(realtime.state.channels).toHaveLength(1);
    expect(insertHandlers().map((b) => b.filter)).toEqual([
      {
        event: "INSERT",
        schema: "public",
        table: "events",
        filter: "user_id=eq.user-1",
      },
    ]);
  });

  it("syncs at once when an events row is inserted (ac-1)", async () => {
    await mount();
    expect(syncCalls(), "first sync on mount").toBe(1);
    await insert("visit");
    expect(syncCalls(), "insert triggers a sync").toBe(2);
  });

  it("keeps polling while the channel errors (ac-2)", async () => {
    await mount();
    await act(async () =>
      realtime.state.channels[0].status?.("CHANNEL_ERROR", new Error("down")),
    );
    const before = syncCalls();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(config.game.sync.pollSeconds * 1000);
    });
    expect(syncCalls(), "the poll still ran").toBe(before + 1);
    expect(realtime.state.channels, "no resubscribe per sync").toHaveLength(1);
  });

  it("hands Realtime the token from the API, or none when it is refused", async () => {
    await mount();
    const accessToken = realtime.state.accessToken!;
    await expect(accessToken()).resolves.toBe("t");
    expect(fetch).toHaveBeenCalledWith(
      "/api/realtime/token",
      expect.objectContaining({ cache: "no-store" }),
    );

    tokenResponse = () => json(401, { error: { message: "Sign in." } });
    await expect(accessToken()).resolves.toBeNull();

    tokenResponse = () => {
      throw new TypeError("offline");
    };
    await expect(accessToken()).resolves.toBeNull();

    const before = syncCalls();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(config.game.sync.pollSeconds * 1000);
    });
    expect(syncCalls(), "the poll still ran").toBe(before + 1);
  });

  it("removes the channel on unmount", async () => {
    await mount();
    expect(realtime.state.removed).toHaveLength(0);
    await act(async () => root!.unmount());
    root = null;
    expect(realtime.state.removed).toEqual([
      realtime.state.channels[0].channel,
    ]);
  });
});

describe("landing toasts (ac-6)", () => {
  it.each(["landed-in", "landed-out"])(
    "toasts the title when the newest unread item is %s",
    async (kind) => {
      notifications = [
        item({ id: "n2", kind, title: "Pip landed" }),
        item({ id: "n1", kind: "hungry", title: "Pip is hungry" }),
      ];
      await mount();
      await insert("notification");
      expect(fetch).toHaveBeenCalledWith(
        "/api/notifications",
        expect.objectContaining({ cache: "no-store" }),
      );
      expect(toast.mock.calls).toEqual([["Pip landed"]]);
    },
  );

  it("never toasts the same item twice", async () => {
    notifications = [item({ id: "n1", title: "Pip landed" })];
    await mount();
    await insert("notification");
    await insert("notification");
    expect(calls("/api/notifications"), "both inserts looked").toBe(2);
    expect(toast.mock.calls).toEqual([["Pip landed"]]);

    notifications = [item({ id: "n2", title: "Rue landed" }), ...notifications];
    await insert("notification");
    expect(toast.mock.calls).toEqual([["Pip landed"], ["Rue landed"]]);
  });

  it("toasts once when two inserts overlap", async () => {
    notifications = [item({ id: "n1", title: "Pip landed" })];
    await mount();
    await act(async () => {
      insertHandlers()[0].handler({ new: { kind: "notification" } });
      insertHandlers()[0].handler({ new: { kind: "notification" } });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls("/api/notifications")).toBe(2);
    expect(toast.mock.calls).toEqual([["Pip landed"]]);
  });

  it("stays quiet when the newest unread item is not a landing", async () => {
    notifications = [
      item({ id: "n2", kind: "hungry", title: "Pip is hungry" }),
      item({ id: "n1", title: "Pip landed" }),
    ];
    await mount();
    await insert("notification");
    expect(calls("/api/notifications")).toBe(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it("stays quiet when the newest landing is already read", async () => {
    notifications = [item({ id: "n1", title: "Pip landed", read: true })];
    await mount();
    await insert("notification");
    expect(calls("/api/notifications")).toBe(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it("does not look at notifications for other events", async () => {
    notifications = [item({ id: "n1", title: "Pip landed" })];
    await mount();
    await insert("visit");
    expect(syncCalls(), "the insert still syncs").toBe(2);
    expect(calls("/api/notifications")).toBe(0);
    expect(toast).not.toHaveBeenCalled();
  });

  it("stays quiet and keeps syncing when notifications fail to load", async () => {
    await mount();
    notificationsResponse = () => {
      throw new TypeError("offline");
    };
    await insert("notification");
    notificationsResponse = () => json(401, { error: { message: "Sign in." } });
    await insert("notification");
    expect(calls("/api/notifications")).toBe(2);
    expect(syncCalls(), "both inserts synced").toBe(3);
    expect(toast).not.toHaveBeenCalled();
  });
});
