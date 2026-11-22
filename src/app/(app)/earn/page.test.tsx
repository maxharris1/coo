import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastContext } from "@/components/Toasts";
import type { LocalDate } from "@/lib/game/time";
import type { Earn } from "@/server/services/earn";
import { earnTop, type EarnState } from "./earn";
import EarnPage from "./page";

const states: EarnState[] = [];
let retry: () => void = () => {};
let changed: () => void = () => {};

vi.mock("./EarnView", () => ({
  EarnView: ({
    state,
    onRetry,
    onChanged,
  }: {
    state: EarnState;
    onRetry: () => void;
    onChanged: () => void;
  }) => {
    states.push(state);
    retry = onRetry;
    changed = onChanged;
    return null;
  },
}));

const EARN: Earn = {
  seeds: 240,
  punchCard: {
    weekStart: "2026-11-16" as LocalDate,
    deliveries: 6,
    size: 10,
    pay: 50,
    paid: false,
  },
  payTable: {
    delivery: {
      base: 10,
      milesPerBonusSeed: 25,
      fullPayPerDay: 5,
      reducedPay: 2,
    },
    replyHome: 5,
    newCity: 25,
    partyHatWeekend: null,
  },
  jobs: { offers: [], leftToday: 2 },
  found: [],
  earned: null,
};

let respond: () => Response;
const toast = vi.fn();

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  states.length = 0;
  toast.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== "/api/earn") {
        throw new Error(`unexpected ${String(input)}`);
      }
      return respond();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/earn page lifecycle", () => {
  it("loads, fails with the API's message, then retries into the card", async () => {
    respond = () =>
      Response.json(
        { error: { code: "unauthorized", message: "Sign in first." } },
        { status: 401 },
      );
    const root = createRoot(
      Object.assign(new EventTarget(), {
        nodeType: 1,
        tagName: "DIV",
        ownerDocument: document,
      }) as unknown as Element,
    );
    await act(async () =>
      root.render(
        <ToastContext.Provider value={toast}>
          <EarnPage />
        </ToastContext.Provider>,
      ),
    );
    expect(states[0]).toEqual({ kind: "loading" });

    await settle();
    expect(states.at(-1)).toEqual({
      kind: "failed",
      message: "Sign in first.",
    });
    expect(toast).toHaveBeenCalledWith("Sign in first.");

    respond = () => Response.json(EARN);
    const before = states.length;
    await act(async () => retry());
    expect(states[before]).toEqual({ kind: "loading" });

    await settle();
    expect(states.at(-1)).toEqual({
      kind: "ready",
      top: earnTop(EARN),
      jobs: EARN.jobs,
      found: EARN.found,
    });

    await act(async () => root.unmount());
  });

  it("reloads Earn in place after a job starts", async () => {
    respond = () => Response.json(EARN);
    const root = createRoot(
      Object.assign(new EventTarget(), {
        nodeType: 1,
        tagName: "DIV",
        ownerDocument: document,
      }) as unknown as Element,
    );
    await act(async () =>
      root.render(
        <ToastContext.Provider value={toast}>
          <EarnPage />
        </ToastContext.Provider>,
      ),
    );
    await settle();

    const later = { ...EARN, jobs: { offers: [], leftToday: 1 } };
    respond = () => Response.json(later);
    const before = states.length;
    await act(async () => changed());
    await settle();

    expect(states.slice(before)).not.toContainEqual({ kind: "loading" });
    expect(states.at(-1)).toEqual({
      kind: "ready",
      top: earnTop(later),
      jobs: later.jobs,
      found: later.found,
    });

    await act(async () => root.unmount());
  });
});
