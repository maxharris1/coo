import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { SyncState } from "./SyncProvider";

type Effect = { deps?: readonly unknown[]; cleanup?: void | (() => void) };

const hooks = vi.hoisted(() => {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = false;
  let rendering = false;
  let rerender: () => void = () => {};
  const pending: (() => void)[] = [];

  const flush = () => {
    if (rendering) return;
    rendering = true;
    do {
      dirty = false;
      cursor = 0;
      rerender();
      while (pending.length) pending.shift()!();
    } while (dirty);
    rendering = false;
  };

  const memo = <T,>(make: () => T, deps: readonly unknown[]) => {
    const i = cursor++;
    const old = slots[i] as { value: T; deps: readonly unknown[] } | undefined;
    if (old && deps.every((d, k) => Object.is(d, old.deps[k]))) {
      return old.value;
    }
    const value = make();
    slots[i] = { value, deps };
    return value;
  };

  return {
    mount(render: () => void) {
      slots.length = 0;
      pending.length = 0;
      rerender = render;
      flush();
    },
    unmount() {
      for (const slot of slots) {
        const cleanup = (slot as Effect | undefined)?.cleanup;
        if (typeof cleanup === "function") cleanup();
      }
      slots.length = 0;
    },
    useState<T>(init: T | (() => T)) {
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = typeof init === "function" ? (init as () => T)() : init;
      }
      return [
        slots[i] as T,
        (v: T | ((old: T) => T)) => {
          const next =
            typeof v === "function" ? (v as (old: T) => T)(slots[i] as T) : v;
          if (Object.is(slots[i], next)) return;
          slots[i] = next;
          dirty = true;
          flush();
        },
      ] as const;
    },
    useRef<T>(current: T) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current };
      return slots[i] as { current: T };
    },
    useMemo: memo,
    useCallback: <T,>(fn: T, deps: readonly unknown[]) => memo(() => fn, deps),
    useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
      const i = cursor++;
      const old = slots[i] as Effect | undefined;
      const same =
        old?.deps &&
        deps &&
        deps.length === old.deps.length &&
        deps.every((d, k) => Object.is(d, old.deps![k]));
      if (same) return;
      const effect: Effect = { deps };
      slots[i] = effect;
      pending.push(() => {
        if (typeof old?.cleanup === "function") old.cleanup();
        effect.cleanup = fn();
      });
    },
  };
});

vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useMemo: hooks.useMemo,
  useCallback: hooks.useCallback,
  useEffect: hooks.useEffect,
}));

const { SyncProvider } = await import("./SyncProvider");

const EVERY_MS = config.game.sync.pollSeconds * 1000;

let tree: ReactElement<{ value: SyncState }>;
const value = () => tree.props.value;

describe("SyncProvider", () => {
  let win: EventTarget;
  let reply: (res: Response) => void;
  const fetch = vi.fn<typeof globalThis.fetch>(
    () =>
      new Promise<Response>((resolve) => {
        reply = resolve;
      }),
  );

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    fetch.mockClear();
    win = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal(
      "document",
      Object.assign(new EventTarget(), { visibilityState: "visible" }),
    );
    vi.stubGlobal("fetch", fetch);
    hooks.mount(() => {
      tree = SyncProvider({ children: null }) as typeof tree;
    });
  });

  afterEach(() => {
    hooks.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads once on mount and provides the payload with the clock offset", async () => {
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(value().data).toBeNull();
    await vi.advanceTimersByTimeAsync(400);
    const body = { unread: 3, serverNow: 10_200 };
    reply(new Response(JSON.stringify(body)));
    await vi.advanceTimersByTimeAsync(0);
    expect(value()).toMatchObject({
      data: body,
      error: null,
      offsetMs: 10_000,
    });
  });

  it("makes no further requests after unmount", async () => {
    reply(new Response(JSON.stringify({ serverNow: 0 })));
    await vi.advanceTimersByTimeAsync(0);
    win.dispatchEvent(new Event("focus"));
    expect(fetch, "focus loads while mounted").toHaveBeenCalledTimes(2);
    reply(new Response(JSON.stringify({ serverNow: 0 })));
    await vi.advanceTimersByTimeAsync(0);
    hooks.unmount();
    await vi.advanceTimersByTimeAsync(EVERY_MS * 3);
    win.dispatchEvent(new Event("focus"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
