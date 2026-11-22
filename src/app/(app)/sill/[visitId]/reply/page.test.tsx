import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SyncContext,
  SyncProvider,
  type SyncState,
} from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { FriendRow } from "@/server/services/friends";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import type { ReplyView } from "./ReplyView";
import ReplyPage from "./page";
import { readHandoff } from "./takeoffHandoff";

type ViewProps = ComponentProps<typeof ReplyView>;

const seen = vi.hoisted(() => ({
  view: null as ViewProps | null,
  loading: false,
  toasts: [] as string[],
  replace: vi.fn(),
}));

vi.mock("./ReplyView", () => ({
  ReplyView: (props: ViewProps) => {
    seen.view = props;
    return null;
  },
}));
vi.mock("@/components/Loader", () => ({
  Loader: () => {
    seen.loading = true;
    return null;
  },
}));
vi.mock("@/components/Toasts", () => ({
  useToast: () => (message: string) => void seen.toasts.push(message),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: seen.replace }),
  useParams: () => ({ visitId: "v1" }),
}));

const MIN = 60_000;
const NOW = Date.parse("2026-11-20T19:00:00Z");
const REPLY = "Bread is secured. Tell Dumpling the tuna was not for her.";

const VISIT: SyncVisit = {
  id: "v1",
  bird: {
    id: "b1",
    name: "Dumpling",
    breed: "city",
    look: "dumpling",
    pronoun: "she",
    speedMph: 43,
    gear: [],
  },
  owner: { id: "u1", name: "Priya", handle: "priya" },
  note: {
    id: "n1",
    body: "Bring the bread.",
    doodle: null,
    createdAt: NOW - 120 * MIN,
  },
  arrivedAt: NOW - 2 * MIN,
  leavesAt: NOW + 28 * MIN,
  status: "waiting",
  snackGiven: false,
  returnMi: 81,
  flight: { distanceMi: 80, durationMs: 112 * MIN, delayKind: "none" },
};

const PRIYA = {
  id: "u1",
  name: "Priya",
  handle: "priya",
  shows: "city",
  theyShow: "city",
  where: "Philadelphia, PA",
  distanceMi: 81,
} as FriendRow;

let replyRes: { status: number; body: unknown };
let serverStart: number;
let syncGate: Promise<void> | null;
let root: Root | null;
const session = new Map<string, string>();

function fakeFetch(url: RequestInfo | URL) {
  if (String(url) === "/api/sync") {
    const body = {
      serverNow: NOW + performance.now() - serverStart,
      visits: [VISIT],
      me: { timezone: "America/New_York", units: "mi" },
    };
    return (syncGate ?? Promise.resolve()).then(() => Response.json(body));
  }
  if (String(url) === "/api/friends") {
    return Promise.resolve(Response.json({ friends: [PRIYA], guestLinks: [] }));
  }
  return Promise.resolve(
    Response.json(replyRes.body, { status: replyRes.status }),
  );
}

const replyCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(
      ([url]) => String(url) !== "/api/friends" && String(url) !== "/api/sync",
    );

const refresh = vi.fn();

const sync = (visits: SyncVisit[] | null, serverNow = NOW): SyncState => ({
  data:
    visits &&
    ({
      serverNow,
      serverNowMono: performance.now(),
      visits,
      me: { timezone: "America/New_York", units: "mi" },
    } as unknown as SyncPayload),
  error: null,
  offsetMs: 0,
  refresh,
});

const docStub = Object.assign(new EventTarget(), {
  visibilityState: "visible" as DocumentVisibilityState,
});

async function mountSynced() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  const r = createRoot(container);
  root = r;
  await act(async () =>
    r.render(
      <SyncProvider>
        <ReplyPage />
      </SyncProvider>,
    ),
  );
  seen.loading = false;
}

const syncNow = () =>
  act(async () => void docStub.dispatchEvent(new Event("visibilitychange")));

async function show(visits: SyncVisit[] | null, serverNow = NOW) {
  if (!root) {
    const container = Object.assign(new EventTarget(), {
      nodeType: 1,
      tagName: "DIV",
      ownerDocument: new EventTarget(),
    }) as unknown as Element;
    root = createRoot(container);
  }
  const r = root;
  await act(async () =>
    r.render(
      <SyncContext.Provider value={sync(visits, serverNow)}>
        <ReplyPage />
      </SyncContext.Provider>,
    ),
  );
}

const view = () => {
  if (!seen.view) throw new Error("no view");
  return seen.view;
};

const type = (text: string) => act(async () => view().onNote(text));
const send = () => act(async () => view().onSend());
const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
const elapse = (ms: number) =>
  act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  seen.view = null;
  seen.loading = false;
  seen.toasts.length = 0;
  seen.replace.mockClear();
  session.clear();
  replyRes = { status: 200, body: { flight: { id: "f1", kind: "return" } } };
  serverStart = performance.now();
  syncGate = null;
  refresh.mockClear();
  root = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => void session.set(k, v),
  });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("document", docStub);
});

afterEach(async () => {
  const r = root;
  root = null;
  await act(async () => r?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/sill/[visitId]/reply (ac-1)", () => {
  it("shows the loader until the first sync lands", async () => {
    await show(null);
    expect(seen.loading).toBe(true);
    expect(seen.view).toBeNull();
    expect(seen.replace).not.toHaveBeenCalled();
  });

  it("sends the user back to the visit when it is not on the sill", async () => {
    await show([]);
    expect(seen.replace).toHaveBeenCalledWith("/sill/v1");
    expect(seen.view).toBeNull();
  });

  it("sends the user back once a sync confirms the bird's wait is over", async () => {
    await show([VISIT]);
    expect(seen.replace).not.toHaveBeenCalled();
    await tick(28 * MIN);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen.replace).not.toHaveBeenCalled();
    await show([VISIT], NOW + 28 * MIN);
    expect(seen.replace).toHaveBeenCalledWith("/sill/v1");
  });

  it("goes by the server clock, not the device clock", async () => {
    await show([VISIT], NOW + 28 * MIN);
    expect(seen.replace).toHaveBeenCalledWith("/sill/v1");
  });

  it("applies the first sync's clock before checking the wait", async () => {
    vi.setSystemTime(NOW + 60 * MIN);
    await show(null);
    await show([VISIT]);
    expect(seen.replace).not.toHaveBeenCalled();
    expect(view().model.wait).toMatch(/^She waits 28 more minutes/);
  });

  it("builds the model from the visit and the friend row", async () => {
    await show([VISIT]);
    expect(view().model.route).toBe(
      "Philadelphia, 81 miles. About 1h 53m at her pace.",
    );
    expect(view().model.wait).toMatch(/^She waits 28 more minutes/);
    expect(view().backHref).toBe("/sill/v1");
    await tick(MIN);
    expect(view().model.wait).toMatch(/^She waits 27 more minutes/);
  });

  it("counts the typed reply against the bird's limit", async () => {
    await show([VISIT]);
    await type(REPLY);
    expect(view().note).toBe(REPLY);
    expect(view().counter).toEqual({
      label: "57 of 140 characters",
      over: false,
    });
    await type("a".repeat(141));
    expect(view().counter.over).toBe(true);
  });

  it("saves the hand-off and moves to takeoff on success", async () => {
    await show([VISIT]);
    await type(REPLY);
    await send();
    const [[url, init]] = replyCalls();
    expect(String(url)).toBe("/api/visits/v1/reply");
    expect(JSON.parse(String(init?.body))).toEqual({ body: REPLY });
    expect(readHandoff("v1")).toEqual({
      flightId: "f1",
      pronoun: "she",
      breed: "city",
    });
    expect(seen.replace).toHaveBeenCalledWith("/sill/v1/takeoff");
    expect(seen.toasts).toEqual([]);
  });

  it("stays on takeoff when the visit then drops out of sync", async () => {
    await show([VISIT]);
    await type(REPLY);
    await send();
    await show([]);
    expect(seen.replace).toHaveBeenCalledTimes(1);
    expect(seen.replace).toHaveBeenCalledWith("/sill/v1/takeoff");
  });

  it("keeps the text and toasts the API's message on an error", async () => {
    replyRes = {
      status: 409,
      body: { error: { code: "conflict", message: "The visit is over." } },
    };
    await show([VISIT]);
    await type(REPLY);
    await send();
    expect(seen.toasts).toEqual(["The visit is over."]);
    expect(view().note).toBe(REPLY);
    expect(view().sending).toBe(false);
    expect(readHandoff("v1")).toBeNull();
    expect(seen.replace).not.toHaveBeenCalled();
  });

  it("does not post an empty or over-limit reply", async () => {
    await show([VISIT]);
    await send();
    await type("a".repeat(141));
    await send();
    expect(replyCalls()).toHaveLength(0);
  });
});

describe("/sill/[visitId]/reply clock jumps (#592)", () => {
  it("stays on Reply with the draft when the device clock jumps back 60 minutes before a sync", async () => {
    await mountSynced();
    expect(view().model.wait).toMatch(/^She waits 28 more minutes/);
    await type(REPLY);
    vi.setSystemTime(NOW - 60 * MIN);
    await syncNow();
    expect(seen.replace).not.toHaveBeenCalled();
    expect(seen.loading).toBe(false);
    expect(view().note).toBe(REPLY);
    expect(view().model.wait).toMatch(/^She waits 28 more minutes/);
    await elapse(MIN);
    expect(seen.replace).not.toHaveBeenCalled();
    expect(view().note).toBe(REPLY);
    expect(view().model.wait).toMatch(/^She waits 27 more minutes/);
  });

  it("stays on Reply with the draft when the device clock jumps forward 60 minutes between syncs", async () => {
    await mountSynced();
    await type(REPLY);
    vi.setSystemTime(NOW + 60 * MIN);
    await elapse(1000);
    expect(seen.replace).not.toHaveBeenCalled();
    expect(seen.loading).toBe(false);
    expect(view().note).toBe(REPLY);
    expect(view().model.wait).toMatch(/^She waits 28 more minutes/);
    await elapse(MIN - 1000);
    expect(seen.replace).not.toHaveBeenCalled();
    expect(view().note).toBe(REPLY);
    expect(view().model.wait).toMatch(/^She waits 27 more minutes/);
  });

  it("still leaves Reply once the wait is over on server time after a clock jump", async () => {
    await mountSynced();
    vi.setSystemTime(NOW - 60 * MIN);
    await syncNow();
    await elapse(28 * MIN);
    expect(seen.replace).toHaveBeenCalledWith("/sill/v1");
  });

  it("stays on Reply with the draft when the device clock jumps back 60 minutes while a sync is in flight", async () => {
    await mountSynced();
    await type(REPLY);
    let release = () => {};
    syncGate = new Promise((resolve) => (release = resolve));
    await syncNow();
    vi.setSystemTime(NOW - 60 * MIN);
    await act(async () => release());
    await elapse(0);
    expect(seen.replace).not.toHaveBeenCalled();
    expect(view().note).toBe(REPLY);
    expect(view().model.wait).toMatch(/^She waits 28 more minutes/);
  });

  it("stays on Reply with the draft when the device clock jumps forward 60 minutes while a sync is in flight, then corrects", async () => {
    await mountSynced();
    await type(REPLY);
    let release = () => {};
    syncGate = new Promise((resolve) => (release = resolve));
    await syncNow();
    vi.setSystemTime(NOW + 60 * MIN);
    await act(async () => release());
    await elapse(0);
    expect(seen.replace).not.toHaveBeenCalled();
    expect(view().note).toBe(REPLY);
    expect(view().model.wait).toMatch(/^She waits 28 more minutes/);
    syncGate = null;
    vi.setSystemTime(NOW);
    await syncNow();
    expect(seen.replace).not.toHaveBeenCalled();
    expect(view().note).toBe(REPLY);
  });
});

describe("/sill/[visitId]/reply transient expiry (#592 ac-2)", () => {
  it("keeps Reply and the draft when the visit only looks over locally, and leaves once a sync confirms", async () => {
    await show([VISIT]);
    await type(REPLY);
    await tick(28 * MIN);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen.replace).not.toHaveBeenCalled();
    expect(view().note).toBe(REPLY);
    await show([{ ...VISIT, leavesAt: NOW + 40 * MIN }], NOW + 28 * MIN);
    expect(seen.replace).not.toHaveBeenCalled();
    expect(view().note).toBe(REPLY);
    await show([VISIT], NOW + 28 * MIN);
    expect(seen.replace).toHaveBeenCalledWith("/sill/v1");
  });
});
