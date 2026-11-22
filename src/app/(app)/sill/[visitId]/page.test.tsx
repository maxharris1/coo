import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { FriendRow } from "@/server/services/friends";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import type { GoneHome, Landed } from "../Landed";
import VisitPage from "./page";

type LandedProps = ComponentProps<typeof Landed>;
type GoneProps = ComponentProps<typeof GoneHome>;

const seen = vi.hoisted(() => ({
  landed: null as LandedProps | null,
  gone: null as GoneProps | null,
  loading: false,
  toasts: [] as string[],
  replace: vi.fn(),
  visitId: "v1",
}));

vi.mock("../Landed", () => ({
  Landed: (props: LandedProps) => {
    seen.landed = props;
    return null;
  },
  GoneHome: (props: GoneProps) => {
    seen.gone = props;
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
  useParams: () => ({ visitId: seen.visitId }),
}));

const MIN = 60_000;
const NOW = Date.parse("2026-11-20T19:00:00Z");
const LEAVES = NOW + 30 * MIN;

const visit = (over: Partial<SyncVisit> = {}): SyncVisit => ({
  id: "v1",
  bird: {
    id: "b1",
    name: "Dumpling",
    breed: "city",
    look: "dumpling",
    pronoun: "they",
    speedMph: 42,
    gear: [],
  },
  owner: { id: "u1", name: "Priya", handle: "priya" },
  note: { id: "n1", body: "Bring the bread.", createdAt: NOW - 120 * MIN },
  arrivedAt: NOW - 5 * MIN,
  leavesAt: LEAVES,
  status: "waiting",
  snackGiven: false,
  returnMi: 81,
  flight: { distanceMi: 81, durationMs: 112 * MIN, delayKind: "minor" },
  ...over,
});

const PRIYA = {
  id: "u1",
  name: "Priya",
  handle: "priya",
  shows: "city",
  theyShow: "city",
  where: "Philadelphia, PA",
  distanceMi: 81,
} as FriendRow;

let snackReply: { status: number; body: unknown };
let friends: FriendRow[];
let reducedMotion: boolean;
let refresh: ReturnType<typeof vi.fn<() => void>>;
let root: Root | null;
const stores = {
  local: new Map<string, string>(),
  session: new Map<string, string>(),
};

const storage = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => void m.set(k, String(v)),
  removeItem: (k: string) => void m.delete(k),
});

const quotaFull = (m: Map<string, string>) => ({
  ...storage(m),
  setItem: () => {
    throw new DOMException(
      "The quota has been exceeded.",
      "QuotaExceededError",
    );
  },
});

function blockStorage(name: "localStorage" | "sessionStorage") {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get: () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
}

function fakeFetch(url: RequestInfo | URL) {
  if (String(url) === "/api/friends") {
    return Promise.resolve(Response.json({ friends, guestLinks: [] }));
  }
  return Promise.resolve(
    Response.json(snackReply.body, { status: snackReply.status }),
  );
}

const snackCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url) !== "/api/friends")
    .map(([url, init]) => ({
      url: String(url),
      method: init?.method,
      body: init?.body,
    }));

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
        <VisitPage />
      </SyncContext.Provider>,
    ),
  );
}

async function leave() {
  const r = root;
  root = null;
  await act(async () => r?.unmount());
  seen.landed = null;
  seen.gone = null;
}

const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  seen.landed = null;
  seen.gone = null;
  seen.loading = false;
  seen.toasts.length = 0;
  seen.replace.mockClear();
  seen.visitId = "v1";
  snackReply = { status: 200, body: { seeds: 40 } };
  friends = [PRIYA];
  reducedMotion = false;
  refresh = vi.fn<() => void>();
  stores.local.clear();
  stores.session.clear();
  root = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      HTMLIFrameElement: class {},
      matchMedia: (q: string) => ({
        matches: q === "(prefers-reduced-motion: reduce)" && reducedMotion,
      }),
    }),
  );
  vi.stubGlobal("localStorage", storage(stores.local));
  vi.stubGlobal("sessionStorage", storage(stores.session));
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(async () => {
  await leave();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/sill/[visitId] gone-home flip (ac-1)", () => {
  it("shows the loader and nothing else until the first sync lands", async () => {
    await show(null);
    expect(seen.loading).toBe(true);
    expect(seen.landed).toBeNull();
    expect(seen.gone).toBeNull();
  });

  it("flips to gone home once the client clock passes leavesAt", async () => {
    await show([visit()]);
    expect(seen.landed?.state).toBe("waiting");
    expect(seen.landed?.visit.id).toBe("v1");

    await tick(30 * MIN - 2000);
    expect(seen.landed?.state).toBe("waiting");

    await tick(2000);
    expect(seen.landed?.state).toBe("gone");
    expect(seen.landed?.visit.bird.name).toBe("Dumpling");
  });

  it("ticks nowMs on the server clock so the countdown moves", async () => {
    await show([visit()]);
    const first = seen.landed!.nowMs;
    expect(first).toBe(NOW);
    await tick(60_000);
    expect(seen.landed!.nowMs).toBe(NOW + 60_000);
  });

  it("uses the server clock on the sync that brings it, whatever the device clock says", async () => {
    vi.setSystemTime(NOW + 60 * MIN);
    await show([visit()], NOW + 60 * MIN);
    await show([visit()]);
    expect(seen.landed?.state).toBe("waiting");
    expect(seen.landed?.nowMs).toBe(NOW);
  });

  it("shows gone home, note kept, when the visit drops out of sync", async () => {
    await show([visit()]);
    expect(seen.landed?.state).toBe("waiting");

    await show([]);
    expect(seen.landed?.state).toBe("gone");
    expect(seen.landed?.visit.note.body).toBe("Bring the bread.");
  });

  it("names the bird that left when the page reopens after it has gone", async () => {
    await show([visit()]);
    await leave();

    await show([]);
    expect(seen.landed).toBeNull();
    expect(seen.gone).toEqual({ birdName: "Dumpling", ownerId: "u1" });
    expect(seen.replace).not.toHaveBeenCalled();
  });

  it("never stores the note body", async () => {
    await show([visit()]);
    const stored = [...stores.local.values(), ...stores.session.values()].join(
      " ",
    );
    expect(stored).not.toContain("Bring the bread");
  });

  it("sends a visit it never saw back to the sill", async () => {
    seen.visitId = "unknown";
    await show([visit()]);
    expect(seen.landed).toBeNull();
    expect(seen.gone).toBeNull();
    expect(seen.replace).toHaveBeenCalledWith("/sill");
  });
});

describe("/sill/[visitId] landing and snack (ac-2)", () => {
  it("plays the landing on the first view of a visit only", async () => {
    await show([visit()]);
    expect(seen.landed?.animate).toBe(true);
    await leave();

    await show([visit()]);
    expect(seen.landed?.animate).toBe(false);
  });

  it("plays the landing again for a different visit", async () => {
    await show([visit()]);
    await leave();
    seen.visitId = "v2";
    await show([visit({ id: "v2" })]);
    expect(seen.landed?.animate).toBe(true);
  });

  it("shows the final frame under reduced motion", async () => {
    reducedMotion = true;
    await show([visit()]);
    expect(seen.landed?.animate).toBe(false);
  });

  it("passes the sender's shared city and the host's time zone", async () => {
    await show([visit()]);
    expect(seen.landed?.city).toEqual({ name: "Philadelphia", region: "PA" });
    expect(seen.landed?.timeZone).toBe("America/New_York");
  });

  it("leaves the city out when the sender shares only a block", async () => {
    friends = [{ ...PRIYA, theyShow: "block", where: "Fishtown" }];
    await show([visit()]);
    expect(seen.landed?.city).toBeNull();
  });

  it("posts the snack, refreshes sync and hides the button", async () => {
    await show([visit()]);
    expect(seen.landed?.visit.snackGiven).toBe(false);

    await act(async () => seen.landed!.onSnack());

    expect(snackCalls()).toEqual([
      { url: "/api/visits/v1/snack", method: "POST", body: "{}" },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen.landed?.visit.snackGiven).toBe(true);
    expect(seen.landed?.snacking).toBe(false);
    expect(seen.toasts).toEqual([]);
  });

  it("toasts the API's message and keeps the button when the snack fails", async () => {
    snackReply = {
      status: 402,
      body: {
        error: {
          code: "insufficient_seeds",
          message: "Not enough seeds for a snack.",
        },
      },
    };
    await show([visit()]);

    await act(async () => seen.landed!.onSnack());

    expect(seen.toasts).toEqual(["Not enough seeds for a snack."]);
    expect(refresh).not.toHaveBeenCalled();
    expect(seen.landed?.visit.snackGiven).toBe(false);
    expect(seen.landed?.snacking).toBe(false);
  });
});

describe("/sill/[visitId] with storage unavailable (ac-2)", () => {
  async function stillUsable() {
    expect(seen.landed?.state).toBe("waiting");
    expect(seen.landed?.animate).toBe(true);

    await act(async () => seen.landed!.onSnack());

    expect(snackCalls()).toEqual([
      { url: "/api/visits/v1/snack", method: "POST", body: "{}" },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen.landed?.visit.snackGiven).toBe(true);
  }

  it("keeps the first view and snack when storage writes hit the quota", async () => {
    vi.stubGlobal("localStorage", quotaFull(stores.local));
    vi.stubGlobal("sessionStorage", quotaFull(stores.session));
    await show([visit()]);
    await stillUsable();
  });

  it("keeps the first view and snack when storage is blocked", async () => {
    blockStorage("localStorage");
    blockStorage("sessionStorage");
    await show([visit()]);
    await stillUsable();
  });

  it("shows gone home when the visit drops out of sync with storage blocked", async () => {
    blockStorage("localStorage");
    blockStorage("sessionStorage");
    await show([visit()]);
    await show([]);
    expect(seen.landed?.state).toBe("gone");
  });

  it("sends an unseen visit back to the sill when storage is blocked", async () => {
    blockStorage("sessionStorage");
    seen.visitId = "unknown";
    await show([visit()]);
    expect(seen.replace).toHaveBeenCalledWith("/sill");
  });
});
