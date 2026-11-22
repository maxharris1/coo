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

  it("never loads on focus while hidden", async () => {
    const s = setup();
    await s.respond(200, ok);
    await vi.advanceTimersByTimeAsync(EVERY_MS);
    await s.respond(200, ok);
    s.focus();
    await s.respond(200, ok);
    expect(s.fetch, "visible poll and focus load").toHaveBeenCalledTimes(3);
    s.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(EVERY_MS);
    s.focus();
    await vi.advanceTimersByTimeAsync(EVERY_MS);
    expect(s.fetch, "no load while hidden").toHaveBeenCalledTimes(3);
    s.sync.stop();
  });

  it("waits for the tab to become visible before the first load", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      () => new Promise<Response>(() => {}),
    );
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), {
      visibilityState: "hidden" as DocumentVisibilityState,
    });
    const sync = startSync({
      fetch,
      win,
      doc,
      everyMs: EVERY_MS,
      timezone: "Europe/London",
      onResult: () => {},
    });
    win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(EVERY_MS);
    expect(fetch, "no load while hidden").not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(fetch).toHaveBeenCalledTimes(1);
    sync.stop();
  });

  it("keeps one request in flight across stop and restart", async () => {
    let active = 0;
    let maximum = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          maximum = Math.max(maximum, ++active);
          init!.signal!.addEventListener("abort", () => {
            active--;
            reject(init!.signal!.reason);
          });
        }),
    );
    const results: SyncResult[] = [];
    const start = () =>
      startSync({
        fetch,
        win: new EventTarget(),
        doc: Object.assign(new EventTarget(), {
          visibilityState: "visible" as DocumentVisibilityState,
        }),
        everyMs: EVERY_MS,
        timezone: "Europe/London",
        onResult: (r) => results.push(r),
      });
    start().stop();
    const sync = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(maximum, "requests in flight at once").toBe(1);
    expect(results, "the aborted load reports nothing").toEqual([]);
    sync.stop();
    expect(active, "stop cancels the pending request").toBe(0);
  });

  it("keeps at most one request in flight", async () => {
    const s = setup();
    s.focus();
    await vi.advanceTimersByTimeAsync(EVERY_MS);
    expect(s.fetch).toHaveBeenCalledTimes(1);
    await s.respond(200, ok);
    s.focus();
    expect(
      s.fetch,
      "next trigger loads once the first lands",
    ).toHaveBeenCalledTimes(2);
    s.sync.stop();
  });

  it("drops a load that a refresh outdated and loads again once it lands", async () => {
    const s = setup();
    s.sync.refresh();
    s.sync.refresh();
    expect(s.fetch, "one request in flight").toHaveBeenCalledTimes(1);
    await s.respond(200, { serverNow: 1 });
    expect(s.results, "the outdated load reports nothing").toEqual([]);
    expect(s.fetch, "one more load after the refresh").toHaveBeenCalledTimes(2);
    await s.respond(200, { serverNow: 2 });
    expect(s.results.map((r) => r.ok && r.payload.serverNow)).toEqual([2]);
    expect(s.fetch).toHaveBeenCalledTimes(2);
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
    const sent = performance.now();
    await vi.advanceTimersByTimeAsync(1000);
    const body = { me: { id: "me" }, unread: 2, serverNow: 60_500 };
    await s.respond(200, body);
    expect(s.results).toEqual([
      {
        ok: true,
        payload: { ...body, serverNowMono: sent + 500 },
        offsetMs: 60_000,
      },
    ]);
    s.sync.stop();
  });

  it("anchors serverNow to the monotonic midpoint of the request, whatever the wall clock does", async () => {
    const s = setup();
    const sent = performance.now();
    vi.setSystemTime(-60 * 60_000);
    await vi.advanceTimersByTimeAsync(1000);
    await s.respond(200, { serverNow: 60_500 });
    const [result] = s.results;
    expect(result.ok && result.payload.serverNowMono).toBe(sent + 500);
    s.sync.stop();
  });

  it("sends the timezone and skips the HTTP cache", () => {
    const s = setup();
    expect(s.fetch).toHaveBeenCalledWith("/api/sync", {
      headers: { "x-timezone": "Europe/London" },
      cache: "no-store",
      signal: expect.any(AbortSignal),
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
