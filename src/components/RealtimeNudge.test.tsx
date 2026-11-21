import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { RealtimeNudge } from "./RealtimeNudge";
import { SyncProvider } from "./SyncProvider";

type Handler = () => void;
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
const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
  if (url === "/api/sync")
    return json(200, { serverNow: 0, me: { id: "user-1" } });
  if (url === "/api/realtime/token") return tokenResponse();
  throw new Error(`unexpected fetch ${String(url)}`);
});
const syncCalls = () =>
  fetch.mock.calls.filter(([url]) => url === "/api/sync").length;

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
        <RealtimeNudge />
      </SyncProvider>,
    );
  });
}

const insertHandlers = () =>
  realtime.state.channels.flatMap((c) =>
    c.bindings.filter((b) => b.type === "postgres_changes"),
  );

beforeEach(() => {
  vi.useFakeTimers();
  realtime.state.accessToken = null;
  realtime.state.channels = [];
  realtime.state.removed = [];
  tokenResponse = () => json(200, { token: "t" });
  fetch.mockClear();
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
    await act(async () => insertHandlers()[0].handler());
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
