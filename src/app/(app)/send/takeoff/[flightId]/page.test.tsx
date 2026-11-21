import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { Flight } from "@/server/services/flights/shape";
import type { TakeoffView } from "./TakeoffView";
import TakeoffPage from "./page";

type ViewProps = ComponentProps<typeof TakeoffView>;

const seen = vi.hoisted(() => ({
  view: null as ViewProps | null,
  error: null as string | null,
  loading: false,
  replace: vi.fn(),
}));

vi.mock("./TakeoffView", () => ({
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
  useRouter: () => ({ replace: seen.replace }),
  useParams: () => ({ flightId: "f1" }),
}));

const NOW = Date.parse("2026-11-20T14:32:00Z");

const FLIGHT = {
  id: "f1",
  status: "flying",
  bird: { id: "b1", name: "Gerald", look: "gerald", gear: ["goggles"] },
  counterpart: { id: "u2", name: "Priya", handle: "priya" },
  releaseAt: NOW,
  arriveAt: NOW + 108 * 60_000,
} as Flight;

let reply: { status: number; body: unknown };
let reducedMotion: boolean;
let root: Root | null;

const sync = (): SyncState => ({
  data: {
    serverNow: NOW,
    me: { timezone: "America/New_York" },
    birds: [{ id: "b1", pronoun: "he", breed: "city" }],
    flights: [],
  } as unknown as SyncPayload,
  error: null,
  offsetMs: 0,
  refresh: () => {},
});

async function show() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  const r = createRoot(container);
  root = r;
  await act(async () =>
    r.render(
      <SyncContext.Provider value={sync()}>
        <TakeoffPage />
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
  seen.replace.mockClear();
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
});

afterEach(async () => {
  const r = root;
  await act(async () => r?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Takeoff page", () => {
  it("shows the flight's takeoff with the mock's copy", async () => {
    await show();
    expect(seen.view).toMatchObject({
      flightId: "f1",
      bird: {
        name: "Gerald",
        look: "gerald",
        gear: ["goggles"],
        breed: "city",
      },
      copy: {
        released: "Released 9:32 am",
        headline: "And he's off",
        note: "Gerald has your note for Priya. He should land around 11:20 am.",
      },
      animate: true,
    });
  });

  it("replaces itself with the tracker 2.5 s after mount", async () => {
    await show();
    await tick(2499);
    expect(seen.replace).not.toHaveBeenCalled();
    await tick(1);
    expect(seen.replace).toHaveBeenCalledExactlyOnceWith("/flights/f1");
  });

  it("with reduced motion shows the final frame and never moves on", async () => {
    reducedMotion = true;
    await show();
    expect(seen.view).toMatchObject({ animate: false });
    await tick(60_000);
    expect(seen.replace).not.toHaveBeenCalled();
  });

  it("does not move on after the screen has gone", async () => {
    await show();
    const r = root;
    root = null;
    await act(async () => r?.unmount());
    await tick(2500);
    expect(seen.replace).not.toHaveBeenCalled();
  });

  it("shows the flight error and stays put when the flight is not mine", async () => {
    reply = { status: 404, body: { error: { code: "not_found" } } };
    await show();
    expect(seen.error).toBe("not_found");
    expect(seen.view).toBeNull();
    await tick(2500);
    expect(seen.replace).not.toHaveBeenCalled();
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
});
