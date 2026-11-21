import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSync, type SyncResult } from "@/components/sync";
import { feedBird } from "./feed";
import { feedThenRefresh } from "./flockRows";

function loft(birdIds: string[]) {
  const hungry = new Map(birdIds.map((id) => [id, true]));
  const log: string[] = [];
  const held: (() => void)[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    log.push(`${method} ${url}`);
    if (method === "POST") {
      hungry.set(url.split("/")[3]!, false);
      return Response.json({ ok: true });
    }
    const birds = [...hungry].map(([id, h]) => ({ id, hungry: h }));
    await new Promise<void>((release) => held.push(release));
    return Response.json({ birds, serverNow: 0 });
  });
  const shown: Record<string, boolean>[] = [];
  const sync = startSync({
    fetch: fetch as typeof globalThis.fetch,
    win: new EventTarget(),
    doc: Object.assign(new EventTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    }),
    everyMs: 60_000,
    timezone: "UTC",
    onResult: (r: SyncResult) => {
      if (r.ok) {
        const birds = r.payload.birds as unknown as {
          id: string;
          hungry: boolean;
        }[];
        shown.push(Object.fromEntries(birds.map((b) => [b.id, b.hungry])));
      }
    },
  });
  const release = async () => {
    held.shift()!();
    await vi.advanceTimersByTimeAsync(0);
  };
  const feed = (id: string) =>
    feedThenRefresh(
      id,
      (birdId) => feedBird(birdId, fetch),
      sync.refresh,
      () => {},
    );
  const settle = async () => {
    while (held.length) await release();
  };
  return { log, held, shown, sync, release, feed, settle };
}

describe("Feed me refetches after the feed lands (ac-2)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a GET after the POST even while a pre-feed sync is pending", async () => {
    const l = loft(["g"]);
    await l.release();
    expect(l.shown.at(-1)).toEqual({ g: true });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(l.held, "a pre-feed sync is pending").toHaveLength(1);

    await l.feed("g");
    await l.settle();

    const post = l.log.indexOf("POST /api/birds/g/feed");
    expect(l.log.slice(post + 1), "a GET after the POST").toContain(
      "GET /api/sync",
    );
    expect(l.shown.at(-1), "the bird shows fed").toEqual({ g: false });
    l.sync.stop();
  });

  it("keeps both feeds when the second lands during the first's refresh", async () => {
    const l = loft(["g", "p"]);
    await l.release();

    await l.feed("g");
    expect(l.held, "the first feed's refresh is pending").toHaveLength(1);
    await l.feed("p");
    await l.settle();

    expect(l.shown.at(-1), "neither feed is lost").toEqual({
      g: false,
      p: false,
    });
    l.sync.stop();
  });
});
