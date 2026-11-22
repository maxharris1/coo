import type { sync } from "@/server/services/sync";

export type SyncPayload = Awaited<ReturnType<typeof sync>> & {
  serverNow: number;
  serverNowMono: number;
};

export type SyncResult =
  | { ok: true; payload: SyncPayload; offsetMs: number }
  | { ok: false; message: string };

const UNREACHABLE = "We could not reach the loft. Try again.";

async function load(
  fetchImpl: typeof fetch,
  timezone: string,
  signal: AbortSignal,
): Promise<SyncResult> {
  try {
    const start = Date.now();
    const monoStart = performance.now();
    const res = await fetchImpl("/api/sync", {
      headers: { "x-timezone": timezone },
      cache: "no-store",
      signal,
    });
    const end = Date.now();
    const monoEnd = performance.now();
    const json: unknown = await res.json().catch(() => null);
    if (res.ok && json) {
      const payload: SyncPayload = {
        ...(json as Omit<SyncPayload, "serverNowMono">),
        serverNowMono: (monoStart + monoEnd) / 2,
      };
      return {
        ok: true,
        payload,
        offsetMs: payload.serverNow - (start + end) / 2,
      };
    }
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export function startSync({
  fetch: fetchImpl,
  win,
  doc,
  everyMs,
  timezone,
  onResult,
}: {
  fetch: typeof fetch;
  win: EventTarget;
  doc: EventTarget & { visibilityState: DocumentVisibilityState };
  everyMs: number;
  timezone: string;
  onResult: (r: SyncResult) => void;
}): { refresh(): void; stop(): void } {
  let state: "idle" | "loading" | "stale" = "idle";
  const lifetime = new AbortController();

  const run = () => {
    state = "loading";
    void load(fetchImpl, timezone, lifetime.signal).then((result) => {
      if (lifetime.signal.aborted) return;
      if (state === "stale") return run();
      state = "idle";
      onResult(result);
    });
  };
  const poll = () => {
    if (state === "idle" && !lifetime.signal.aborted) run();
  };
  const refresh = () => {
    if (lifetime.signal.aborted) return;
    if (state === "idle") run();
    else state = "stale";
  };
  const refreshIfVisible = () => {
    if (doc.visibilityState === "visible") poll();
  };

  const timer = setInterval(refreshIfVisible, everyMs);
  win.addEventListener("focus", refreshIfVisible);
  doc.addEventListener("visibilitychange", refreshIfVisible);
  refreshIfVisible();

  return {
    refresh,
    stop() {
      lifetime.abort();
      clearInterval(timer);
      win.removeEventListener("focus", refreshIfVisible);
      doc.removeEventListener("visibilitychange", refreshIfVisible);
    },
  };
}
