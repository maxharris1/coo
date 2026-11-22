import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { Flight } from "@/server/services/flights/shape";
import type { TakeoffView } from "../../../send/takeoff/[flightId]/TakeoffView";
import { saveHandoff } from "../reply/takeoffHandoff";
import TakeoffHomePage from "./page";

type ViewProps = ComponentProps<typeof TakeoffView>;

const seen = vi.hoisted(() => ({
  view: null as ViewProps | null,
  error: null as string | null,
  loading: false,
  router: { replace: vi.fn() },
}));

vi.mock("../../../send/takeoff/[flightId]/TakeoffView", () => ({
  TakeoffView: (props: ViewProps) => {
    seen.view = props;
    return null;
  },
}));
vi.mock("../../../flights/[id]/FlightError", () => ({
  FlightError: ({ code }: { code: string }) => {
    seen.error = code;
    return null;
  },
}));
vi.mock("@/components/Loader", () => ({
  Loader: () => {
    seen.loading = true;
    return null;
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => seen.router,
  useParams: () => ({ visitId: "v1" }),
}));

const NOW = Date.parse("2026-11-20T16:32:00Z");

const FLIGHT = {
  id: "f1",
  kind: "return",
  status: "flying",
  bird: { id: "b1", name: "Dumpling", look: "dumpling", gear: ["scarf"] },
  owner: { id: "u2", name: "Priya", handle: "priya" },
  counterpart: { id: "u1", name: "Max", handle: "max" },
  releaseAt: NOW,
  arriveAt: NOW + 113 * 60_000,
} as Flight;

let reply: { status: number; body: unknown };
let reducedMotion: boolean;
let root: Root | null;
const session = new Map<string, string>();

const sync = (signedIn = true): SyncState => ({
  data: signedIn
    ? ({
        serverNow: NOW,
        me: { timezone: "America/New_York" },
        birds: [],
        visits: [],
        flights: [],
      } as unknown as SyncPayload)
    : null,
  error: null,
  offsetMs: 0,
  refresh: () => {},
});

async function show(signedIn = true) {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  const r = createRoot(container);
  root = r;
  await act(async () =>
    r.render(
      <SyncContext.Provider value={sync(signedIn)}>
        <TakeoffHomePage />
      </SyncContext.Provider>,
    ),
  );
}

const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  seen.view = null;
  seen.error = null;
  seen.loading = false;
  seen.router.replace.mockClear();
  session.clear();
  reply = { status: 200, body: { flight: FLIGHT, serverNow: NOW } };
  reducedMotion = false;
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
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => void session.set(k, v),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) =>
      Promise.resolve(
        String(url) === "/api/flights/f1"
          ? Response.json(reply.body, { status: reply.status })
          : Response.json({}, { status: 404 }),
      ),
    ),
  );
  saveHandoff("v1", { flightId: "f1", pronoun: "she", breed: "pouter" });
});

afterEach(async () => {
  const r = root;
  await act(async () => r?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TakeoffHome page", () => {
  it("shows the bird heading home with the mock's copy", async () => {
    await show();
    expect(seen.view).toMatchObject({
      flightId: "f1",
      bird: {
        name: "Dumpling",
        look: "dumpling",
        gear: ["scarf"],
        breed: "pouter",
      },
      copy: {
        released: "Released 11:32 am",
        headline: "Homeward bound",
        note: "Dumpling has your reply for Priya. She should land around 1:25 pm.",
      },
      watchLabel: "Watch her go",
      birdTitle: "Dumpling launching off your sill with the reply",
      animate: true,
    });
  });

  it("replaces itself with the tracker 2.5 s after mount", async () => {
    await show();
    await tick(2499);
    expect(seen.router.replace).not.toHaveBeenCalled();
    await tick(1);
    expect(seen.router.replace).toHaveBeenCalledExactlyOnceWith("/flights/f1");
  });

  it("with reduced motion shows the final frame and never moves on", async () => {
    reducedMotion = true;
    await show();
    expect(seen.view).toMatchObject({ animate: false });
    await tick(60_000);
    expect(seen.router.replace).not.toHaveBeenCalled();
  });

  it("does not move on after the screen has gone", async () => {
    await show();
    const r = root;
    root = null;
    await act(async () => r?.unmount());
    await tick(2500);
    expect(seen.router.replace).not.toHaveBeenCalled();
  });

  it("sends the user back to the visit without a hand-off from Reply", async () => {
    session.clear();
    await show();
    expect(seen.router.replace).toHaveBeenCalledExactlyOnceWith("/sill/v1");
    expect(seen.view).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the flight error and stays put when the flight is not mine", async () => {
    reply = { status: 404, body: { error: { code: "not_found" } } };
    await show();
    expect(seen.error).toBe("not_found");
    expect(seen.view).toBeNull();
    await tick(2500);
    expect(seen.router.replace).not.toHaveBeenCalled();
  });

  it("waits on the loader until the flight arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    await show();
    expect(seen.loading).toBe(true);
    expect(seen.view).toBeNull();
  });

  it("waits on the loader until the first sync lands", async () => {
    await show(false);
    expect(seen.loading).toBe(true);
    expect(seen.view).toBeNull();
  });
});
