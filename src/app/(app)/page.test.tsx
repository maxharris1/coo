import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import MainPage from "./page";

const toasts = vi.hoisted(() => [] as string[]);
const feedButtonHandler = vi.hoisted(() => ({
  current: null as ((birdId: string) => void) | null,
}));

vi.mock("./Flock", async (importOriginal) => {
  const { Flock } = await importOriginal<typeof import("./Flock")>();
  return {
    Flock: (props: Parameters<typeof Flock>[0]) => {
      feedButtonHandler.current = props.onFeed;
      return Flock(props);
    },
  };
});

vi.mock("@/components/Toasts", () => ({
  useToast: () => (message: string) => void toasts.push(message),
}));

const render = (data: SyncPayload | null) =>
  renderToStaticMarkup(
    <SyncContext.Provider
      value={
        {
          data,
          error: null,
          offsetMs: 0,
          refresh: () => {},
        } satisfies SyncState
      }
    >
      <MainPage />
    </SyncContext.Provider>,
  );

describe("Main at / (ac-1, ac-2)", () => {
  it("shows the loader until the first sync lands", () => {
    expect(render(null)).toContain('aria-busy="true"');
  });

  it("shows the header, greeting and loft once synced", () => {
    const html = render({
      me: { seeds: 12, perches: 2, timezone: "UTC", loft: null },
      serverNow: Date.parse("2026-11-20T19:00:00Z"),
      birds: [],
      flights: [],
      myVisiting: [],
      egg: null,
    } as unknown as SyncPayload);
    expect(html).toContain("Evening. No birds yet.");
    expect(html).toContain("<span>12</span>");
  });

  it("shows the flock and perches under the loft", () => {
    const html = render({
      me: { seeds: 12, perches: 3, timezone: "UTC", loft: null },
      serverNow: Date.parse("2026-11-20T19:00:00Z"),
      birds: [
        {
          id: "g",
          name: "Gerald",
          look: "gerald",
          status: "home",
          hungry: true,
          gear: [],
        },
      ],
      flights: [],
      myVisiting: [],
      egg: null,
    } as unknown as SyncPayload);
    expect(html).toContain("Your flock");
    expect(html).toContain("1 of 3 perches");
    expect(html).toContain('href="/birds/g"');
    expect(html).toContain(">Feed me</button>");
  });
});

describe("Feed me on Main (ac-2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    toasts.length = 0;
  });

  const tapFeed = (response: Response) => {
    const calls: string[] = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      return response;
    });
    vi.stubGlobal("fetch", fetchSpy);
    const refreshed = new Promise<void>((resolve) => {
      const html = renderToStaticMarkup(
        <SyncContext.Provider
          value={
            {
              data: {
                me: { seeds: 12, perches: 3, timezone: "UTC", loft: null },
                serverNow: Date.parse("2026-11-20T19:00:00Z"),
                birds: [
                  {
                    id: "g",
                    name: "Gerald",
                    look: "gerald",
                    status: "home",
                    hungry: true,
                    gear: [],
                  },
                ],
                flights: [],
                myVisiting: [],
                egg: null,
              } as unknown as SyncPayload,
              error: null,
              offsetMs: 0,
              refresh: () => {
                calls.push("refresh");
                resolve();
              },
            } satisfies SyncState
          }
        >
          <MainPage />
        </SyncContext.Provider>,
      );
      expect(html).toContain(">Feed me</button>");
    });
    return { calls, refreshed };
  };

  it("POSTs the feed endpoint, then refetches", async () => {
    const { calls, refreshed } = tapFeed(Response.json({ ok: true }));
    expect(calls).toEqual([]);
    feedButtonHandler.current!("g");
    await refreshed;
    expect(calls).toEqual(["POST /api/birds/g/feed", "refresh"]);
    expect(toasts).toEqual([]);
  });

  it("toasts the server's message and still refetches when the feed fails", async () => {
    const { calls, refreshed } = tapFeed(
      Response.json(
        { error: { code: "insufficient_seeds", message: "Not enough seeds." } },
        { status: 409 },
      ),
    );
    feedButtonHandler.current!("g");
    await refreshed;
    expect(calls).toEqual(["POST /api/birds/g/feed", "refresh"]);
    expect(toasts).toEqual(["Not enough seeds."]);
  });
});
