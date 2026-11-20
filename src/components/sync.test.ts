import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { startSync, type SyncResult } from "./sync";

const EVERY_MS = config.game.sync.pollSeconds * 1000;
const UNREACHABLE = "We could not reach the loft. Try again.";

function setup() {
  const replies: {
    resolve: (res: Response) => void;
    reject: (err: unknown) => void;
  }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(
    () =>
      new Promise<Response>((resolve, reject) =>
        replies.push({ resolve, reject }),
      ),
  );
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const results: SyncResult[] = [];
  const sync = startSync({
    fetch,
    win,
    doc,
    everyMs: EVERY_MS,
    timezone: "Europe/London",
    onResult: (r) => results.push(r),
  });
  const respond = async (status: number, body: object) => {
    replies.shift()!.resolve(new Response(JSON.stringify(body), { status }));
    await vi.advanceTimersByTimeAsync(0);
  };
  const fail = async () => {
    replies.shift()!.reject(new TypeError("Failed to fetch"));
    await vi.advanceTimersByTimeAsync(0);
  };
  const setVisibility = (state: DocumentVisibilityState) => {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  const focus = () => win.dispatchEvent(new Event("focus"));
  return { fetch, results, sync, respond, fail, setVisibility, focus };
}

const ok = { serverNow: 0 };

describe("startSync", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads at start and again every poll interval", async () => {
    const s = setup();
    expect(s.fetch).toHaveBeenCalledTimes(1);
    await s.respond(200, ok);
    await vi.advanceTimersByTimeAsync(EVERY_MS - 1);
    expect(s.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.fetch).toHaveBeenCalledTimes(2);
    s.sync.stop();
  });

  it("loads when the window regains focus", async () => {
    const s = setup();
    await s.respond(200, ok);
    s.focus();
    expect(s.fetch).toHaveBeenCalledTimes(2);
    s.sync.stop();
  });

  it("never polls while hidden and loads on return to visible", async () => {
    const s = setup();
    await s.respond(200, ok);
    s.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(EVERY_MS * 3);
    expect(s.fetch, "no load while hidden").toHaveBeenCalledTimes(1);
    s.setVisibility("visible");
    expect(s.fetch, "load on return to visible").toHaveBeenCalledTimes(2);
    s.sync.stop();
  });

  it("keeps at most one request in flight", async () => {
    const s = setup();
    s.focus();
    await vi.advanceTimersByTimeAsync(EVERY_MS);
    s.sync.refresh();
    expect(s.fetch).toHaveBeenCalledTimes(1);
    await s.respond(200, ok);
    s.focus();
    expect(
      s.fetch,
      "next trigger loads once the first lands",
    ).toHaveBeenCalledTimes(2);
    s.sync.stop();
  });

  it("stops loading and drops a late response after stop", async () => {
    const s = setup();
    s.sync.stop();
    expect(vi.getTimerCount(), "poll timer cleared").toBe(0);
    s.focus();
    s.sync.refresh();
    s.setVisibility("hidden");
    s.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(EVERY_MS * 3);
    expect(s.fetch).toHaveBeenCalledTimes(1);
    await s.respond(200, ok);
    expect(s.results).toEqual([]);
  });

  it("reports the payload and the server clock offset", async () => {
    const s = setup();
    await vi.advanceTimersByTimeAsync(1000);
    const body = { me: { id: "me" }, unread: 2, serverNow: 60_500 };
    await s.respond(200, body);
    expect(s.results).toEqual([{ ok: true, payload: body, offsetMs: 60_000 }]);
    s.sync.stop();
  });

  it("sends the timezone and skips the HTTP cache", () => {
    const s = setup();
    expect(s.fetch).toHaveBeenCalledWith("/api/sync", {
      headers: { "x-timezone": "Europe/London" },
      cache: "no-store",
    });
    s.sync.stop();
  });

  it("reports the API error message", async () => {
    const s = setup();
    await s.respond(500, {
      error: { code: "internal", message: "Busy" },
      serverNow: 0,
    });
    expect(s.results).toEqual([{ ok: false, message: "Busy" }]);
    s.sync.stop();
  });

  it("reports the loft as unreachable when fetch fails", async () => {
    const s = setup();
    await s.fail();
    expect(s.results).toEqual([{ ok: false, message: UNREACHABLE }]);
    s.sync.stop();
  });
});
