import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import { ToastContext, ToastProvider } from "@/components/Toasts";
import type { LocalDate } from "@/lib/game/time";
import type { Earn } from "@/server/services/earn";
import { renderToStaticMarkup } from "react-dom/server";
import type { SyncPayload } from "@/components/sync";
import { earnTop, type EarnState } from "./earn";
import { JobsList, JobsPanel } from "./JobsPanel";
import EarnPage from "./page";

const states: EarnState[] = [];
let retry: () => void = () => {};
let changed: () => Promise<void> = async () => {};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

vi.mock("./EarnView", () => ({
  EarnView: ({
    state,
    onRetry,
    onChanged,
  }: {
    state: EarnState;
    onRetry: () => void;
    onChanged: () => Promise<void>;
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

const syncWith = (
  birds: Partial<SyncPayload["birds"][number]>[],
  more: {
    seeds?: number;
    unread?: number;
    flights?: Partial<SyncPayload["flights"][number]>[];
  } = {},
) =>
  ({
    data: {
      me: { timezone: "UTC", seeds: more.seeds ?? 240 },
      birds,
      flights: more.flights ?? [],
      unread: more.unread ?? 0,
    } as unknown as SyncPayload,
    error: null,
    offsetMs: 0,
    refresh: () => {},
  }) satisfies SyncState;

const NO_SYNC: SyncState = {
  data: null,
  error: null,
  offsetMs: 0,
  refresh: () => {},
};

const page = (sync: SyncState = NO_SYNC) => (
  <SyncContext.Provider value={sync}>
    <ToastContext.Provider value={toast}>
      <EarnPage />
    </ToastContext.Provider>
  </SyncContext.Provider>
);

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
    await act(async () => root.render(page()));
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
    await act(async () => root.render(page()));
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

  it("keeps the newest allowance when Earn reloads resolve out of order", async () => {
    const OFFERS: Earn["jobs"]["offers"] = [
      { id: "job-deli", text: "Rush a slip", minutes: 12, pay: 8 },
    ];
    respond = () =>
      Response.json({ ...EARN, jobs: { offers: OFFERS, leftToday: 2 } });
    const root = createRoot(
      Object.assign(new EventTarget(), {
        nodeType: 1,
        tagName: "DIV",
        ownerDocument: document,
      }) as unknown as Element,
    );
    await act(async () => root.render(page()));
    await settle();

    const pending: ((left: number) => void)[] = [];
    respond = () => {
      throw new Error("unused");
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) =>
            pending.push((left) =>
              resolve(
                Response.json({
                  ...EARN,
                  jobs: { offers: OFFERS, leftToday: left },
                }),
              ),
            ),
          ),
      ),
    );

    let firstDone = false;
    let secondDone = false;
    await act(async () => {
      void changed().then(() => (firstDone = true));
      void changed().then(() => (secondDone = true));
    });
    expect(pending).toHaveLength(2);

    await act(async () => pending[1](0));
    await settle();
    await act(async () => pending[0](1));
    await settle();
    expect(firstDone && secondDone).toBe(true);

    const last = states.at(-1);
    expect(last?.kind).toBe("ready");
    const jobs = last?.kind === "ready" ? last.jobs : EARN.jobs;
    expect(jobs.leftToday).toBe(0);

    const markup = renderToStaticMarkup(
      <JobsList
        jobs={jobs}
        birds={
          [{ id: "b-pip", name: "Pip", status: "home" }] as SyncPayload["birds"]
        }
        timeZone="UTC"
        sending={false}
        onSend={() => {}}
      />,
    );
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Send Pip<\/button>/);

    await act(async () => root.unmount());
  });

  it("shows a find in place when sync brings a working bird home (f-1)", async () => {
    const mabel = { id: "b-mabel", name: "Mabel" };
    const working = syncWith([
      { ...mabel, status: "busy", busyKind: "job", busyUntil: 1 },
    ]);
    const home = syncWith([
      { ...mabel, status: "home", busyKind: null, busyUntil: null },
    ]);
    respond = () => Response.json(EARN);
    const root = createRoot(
      Object.assign(new EventTarget(), {
        nodeType: 1,
        tagName: "DIV",
        ownerDocument: document,
      }) as unknown as Element,
    );
    await act(async () => root.render(page(working)));
    await settle();

    const find = {
      id: "f-1",
      objectId: "bottle-cap",
      name: "Bottle cap",
      value: 5,
      birdId: "b-mabel",
    };
    respond = () => Response.json({ ...EARN, found: [find] });
    await act(async () => root.render(page(home)));
    await settle();

    const last = states.at(-1);
    const markup = renderToStaticMarkup(
      <SyncContext.Provider value={home}>
        <ToastProvider>
          <JobsPanel
            jobs={EARN.jobs}
            found={last?.kind === "ready" ? last.found : []}
            onChanged={async () => {}}
          />
        </ToastProvider>
      </SyncContext.Provider>,
    );
    expect(markup).toContain("Mabel brought back 1 thing.");
    expect(markup).toContain("Trade for 5");

    await act(async () => root.unmount());
  });

  it("reloads Earn when the first sync lands after Earn loaded (f-1)", async () => {
    respond = () => Response.json(EARN);
    const root = createRoot(
      Object.assign(new EventTarget(), {
        nodeType: 1,
        tagName: "DIV",
        ownerDocument: document,
      }) as unknown as Element,
    );
    await act(async () => root.render(page()));
    await settle();

    const find = {
      id: "f-2",
      objectId: "bottle-cap",
      name: "Bottle cap",
      value: 3,
      birdId: "b-mabel",
    };
    respond = () => Response.json({ ...EARN, found: [find] });
    await act(async () =>
      root.render(
        page(syncWith([{ id: "b-mabel", name: "Mabel", status: "home" }])),
      ),
    );
    await settle();

    expect(states.at(-1)).toMatchObject({ kind: "ready", found: [find] });

    await act(async () => root.unmount());
  });

  it("shows a find when a job started in another tab completes while Earn is hidden", async () => {
    const mabel = { id: "b-mabel", name: "Mabel" };
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
        page(
          syncWith([{ ...mabel, status: "home", busyKind: null }], {
            seeds: 240,
          }),
        ),
      ),
    );
    await settle();
    expect(states.at(-1)).toMatchObject({ kind: "ready", found: [] });

    const find = {
      id: "f-3",
      objectId: "bottle-cap",
      name: "Bottle cap",
      value: 5,
      birdId: "b-mabel",
    };
    respond = () => Response.json({ ...EARN, seeds: 248, found: [find] });
    const done = syncWith([{ ...mabel, status: "home", busyKind: null }], {
      seeds: 248,
    });
    await act(async () => root.render(page(done)));
    await settle();

    const last = states.at(-1);
    expect(last).toMatchObject({ kind: "ready", found: [find] });
    const markup = renderToStaticMarkup(
      <SyncContext.Provider value={done}>
        <ToastProvider>
          <JobsPanel
            jobs={EARN.jobs}
            found={last?.kind === "ready" ? last.found : []}
            onChanged={async () => {}}
          />
        </ToastProvider>
      </SyncContext.Provider>,
    );
    expect(markup).toContain("Mabel brought back 1 thing.");
    expect(markup).toContain("Trade for 5");

    await act(async () => root.unmount());
  });

  it("reloads Earn when sync shows a return landed with the home set unchanged", async () => {
    const pip = { id: "b-pip", name: "Pip", status: "home" as const };
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
        page(
          syncWith([pip], {
            flights: [{ id: "fl-1", kind: "return", status: "flying" }],
          }),
        ),
      ),
    );
    await settle();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    await act(async () =>
      root.render(
        page(
          syncWith([pip], {
            flights: [{ id: "fl-1", kind: "return", status: "landed" }],
          }),
        ),
      ),
    );
    await settle();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it("reloads Earn when sync shows a bird starting a job", async () => {
    respond = () => Response.json(EARN);
    const root = createRoot(
      Object.assign(new EventTarget(), {
        nodeType: 1,
        tagName: "DIV",
        ownerDocument: document,
      }) as unknown as Element,
    );
    const pip = { id: "b-pip", name: "Pip" };
    await act(async () =>
      root.render(page(syncWith([{ ...pip, status: "home" }]))),
    );
    await settle();
    await act(async () =>
      root.render(
        page(
          syncWith([
            { ...pip, status: "busy", busyKind: "job", busyUntil: 1 },
          ]),
        ),
      ),
    );
    await settle();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it("does not reload Earn when sync changes nothing about jobs, returns, finds or seeds", async () => {
    respond = () => Response.json(EARN);
    const root = createRoot(
      Object.assign(new EventTarget(), {
        nodeType: 1,
        tagName: "DIV",
        ownerDocument: document,
      }) as unknown as Element,
    );
    const pip = { id: "b-pip", name: "Pip", status: "home" as const };
    await act(async () =>
      root.render(page(syncWith([{ ...pip, energy: 80 }], { unread: 0 }))),
    );
    await settle();
    await act(async () =>
      root.render(page(syncWith([{ ...pip, energy: 70 }], { unread: 3 }))),
    );
    await settle();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });
});
