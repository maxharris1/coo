import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESEND_AFTER_MS } from "./code";

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

  const set = (i: number, value: unknown) => {
    if (Object.is(slots[i], value)) return;
    slots[i] = value;
    dirty = true;
    flush();
  };

  return {
    mount(render: () => void) {
      slots.length = 0;
      pending.length = 0;
      rerender = render;
      flush();
    },
    useState<T>(init: T | (() => T)) {
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = typeof init === "function" ? (init as () => T)() : init;
      }
      return [
        slots[i] as T,
        (v: T | ((old: T) => T)) =>
          set(
            i,
            typeof v === "function" ? (v as (old: T) => T)(slots[i] as T) : v,
          ),
      ] as const;
    },
    useReducer<S, A, I>(
      reducer: (s: S, a: A) => S,
      arg: I,
      init: (arg: I) => S,
    ) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = init(arg);
      return [
        slots[i] as S,
        (a: A) => set(i, reducer(slots[i] as S, a)),
      ] as const;
    },
    useRef<T>(current: T) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current };
      return slots[i] as { current: T };
    },
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

const postAuth = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  useState: hooks.useState,
  useReducer: hooks.useReducer,
  useRef: hooks.useRef,
  useEffect: hooks.useEffect,
}));
vi.mock("react-dom", () => ({ flushSync: (fn: () => void) => fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../phone", () => ({
  useSignInPhone: () => ({ phone: "+15555550100", setPhone: () => {} }),
}));
vi.mock("../postAuth", () => ({ postAuth }));

const { CodeForm } = await import("./CodeForm");

type Props = {
  children?: ReactNode;
  type?: string;
  onChange?: (e: { target: { value: string } }) => void;
  onClick?: () => void;
};

let tree: ReactNode = null;

const elements = (node: ReactNode): ReactElement<Props>[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Props>;
  return [el, ...elements(el.props.children)];
};

const resendButton = () =>
  elements(tree).find(
    (el) => el.type === "button" && el.props.children === "Send it again",
  );

const type = async (index: number, value: string) => {
  const boxes = elements(tree).filter((el) => el.type === "input");
  boxes[index].props.onChange!({ target: { value } });
  await vi.advanceTimersByTimeAsync(0);
};

const at = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms - Date.now());
};

describe("CodeForm resend deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    postAuth.mockReset();
    hooks.mount(() => {
      tree = CodeForm({});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers Send it again 30 s after mount even when a digit is typed during the wait", async () => {
    await at(10_000);
    await type(0, "1");
    await at(RESEND_AFTER_MS - 1);
    expect(resendButton()).toBeUndefined();
    await at(RESEND_AFTER_MS);
    expect(resendButton(), "resend offered at the 30 s deadline").toBeDefined();
  });

  it("offers Send it again 30 s after a resend made once the first offer appeared", async () => {
    postAuth.mockResolvedValue({ ok: true, next: "/" });
    await at(45_000);
    resendButton()!.props.onClick!();
    await vi.advanceTimersByTimeAsync(0);
    expect(postAuth).toHaveBeenCalledWith("/api/auth/code", {
      phone: "+15555550100",
    });
    expect(resendButton()).toBeUndefined();
    await at(45_000 + RESEND_AFTER_MS - 1);
    expect(resendButton()).toBeUndefined();
    await at(45_000 + RESEND_AFTER_MS);
    expect(resendButton(), "resend offered 30 s after resending").toBeDefined();
  });
});

describe("CodeForm after a correct code", () => {
  const CODE = "priya-AbCdEfGhIj_-";
  let document: { cookie: string };

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    postAuth.mockReset();
    push.mockReset();
    document = { cookie: `coo_return=${CODE}` };
    vi.stubGlobal("document", document);
    hooks.mount(() => {
      tree = CodeForm({});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends a returning user back to the invite they came from", async () => {
    postAuth.mockResolvedValue({ ok: true, next: "/" });
    await type(0, "123456");
    expect(push).toHaveBeenCalledWith(`/join/${CODE}`);
  });

  it("sends a new user to onboarding and keeps the invite", async () => {
    postAuth.mockResolvedValue({ ok: true, next: "/welcome/install" });
    await type(0, "123456");
    expect(push).toHaveBeenCalledWith("/welcome/bird");
    expect(document.cookie).toBe(`coo_return=${CODE}`);
  });
});
