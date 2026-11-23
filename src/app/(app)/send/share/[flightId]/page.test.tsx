import { act, type ComponentProps, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { ToastContext } from "@/components/Toasts";
import type { Flight } from "@/server/services/flights/shape";
import { holdLink, takeLink } from "./linkHandoff";
import type { ShareLinkGone, ShareLinkView } from "./ShareLinkView";
import ShareLinkPage from "./page";

type ViewProps = ComponentProps<typeof ShareLinkView>;

const seen = vi.hoisted(() => ({
  view: null as ViewProps | null,
  gone: null as string | null,
  error: null as string | null,
  loading: false,
}));

vi.mock("./ShareLinkView", () => ({
  ShareLinkView: (props: ViewProps) => {
    seen.view = props;
    return null;
  },
  ShareLinkGone: ({ flightId }: ComponentProps<typeof ShareLinkGone>) => {
    seen.gone = flightId;
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
  useParams: () => ({ flightId: "f1" }),
}));

const NOW = Date.parse("2026-11-20T14:32:00Z");
const URL_ = "https://coo.test/b/gerald-7QK4";

const FLIGHT = {
  id: "f1",
  status: "flying",
  bird: { id: "b1", name: "Gerald", look: "gerald", gear: ["goggles"] },
  guestName: "Maya",
  to: { lat: 0, lon: 0, label: "Fishtown" },
  releaseAt: NOW,
  arriveAt: NOW + 108 * 60_000,
} as Flight;

let reply: { status: number; body: unknown };
let root: Root | null;
const toast = vi.fn();

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

async function show({ strict = false } = {}) {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  const r = createRoot(container);
  root = r;
  const tree = (
    <SyncContext.Provider value={sync()}>
      <ToastContext.Provider value={toast}>
        <ShareLinkPage />
      </ToastContext.Provider>
    </SyncContext.Provider>
  );
  await act(async () =>
    r.render(strict ? <StrictMode>{tree}</StrictMode> : tree),
  );
}

const stubNavigator = (extra: object = {}) => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal("navigator", { clipboard: { writeText }, ...extra });
  return writeText;
};

beforeEach(() => {
  seen.view = null;
  seen.gone = null;
  seen.error = null;
  seen.loading = false;
  toast.mockClear();
  takeLink("f1");
  reply = { status: 200, body: { flight: FLIGHT, serverNow: NOW } };
  root = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  stubNavigator();
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
  vi.unstubAllGlobals();
});

describe("ShareLink page", () => {
  it("shows the held link with the flight's bird, guest and arrival", async () => {
    holdLink("f1", URL_);
    await show();
    expect(seen.view).toMatchObject({
      flightId: "f1",
      bird: {
        name: "Gerald",
        look: "gerald",
        gear: ["goggles"],
        breed: "city",
      },
      pronoun: "he",
      guestName: "Maya",
      place: "Fishtown",
      lands: "this morning",
      url: URL_,
      canShare: false,
    });
  });

  it("takes the link, so nobody can take it again", async () => {
    holdLink("f1", URL_);
    await show();
    expect(takeLink("f1")).toBeUndefined();
  });

  it("keeps the link when StrictMode renders twice", async () => {
    holdLink("f1", URL_);
    await show({ strict: true });
    expect(seen.gone).toBeNull();
    expect(seen.view).toMatchObject({ url: URL_ });
  });

  it("shows the shown-once state without loading the flight when no link is held", async () => {
    await show();
    expect(seen.gone).toBe("f1");
    expect(seen.view).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("copies the link and says so", async () => {
    const writeText = stubNavigator();
    holdLink("f1", URL_);
    await show();
    await act(async () => seen.view!.onCopy());
    expect(writeText).toHaveBeenCalledExactlyOnceWith(URL_);
    expect(toast).toHaveBeenCalledExactlyOnceWith("Link copied");
  });

  it("says so when the copy fails", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.reject(new Error("denied")) },
    });
    holdLink("f1", URL_);
    await show();
    await act(async () => seen.view!.onCopy());
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      "Couldn't copy. Press and hold the link instead.",
    );
  });

  it("offers the share sheet when the browser has one", async () => {
    const share = vi.fn(() => Promise.reject(new Error("AbortError")));
    stubNavigator({ share });
    holdLink("f1", URL_);
    await show();
    expect(seen.view).toMatchObject({ canShare: true });
    await act(async () => seen.view!.onShare());
    expect(share).toHaveBeenCalledExactlyOnceWith({
      text: `I sent you a pigeon. For real. Watch him fly to you: ${URL_}`,
    });
  });

  it("shows the flight error when the flight is not mine", async () => {
    holdLink("f1", URL_);
    reply = { status: 404, body: { error: { code: "not_found" } } };
    await show();
    expect(seen.error).toBe("not_found");
    expect(seen.view).toBeNull();
  });

  it("waits on the loader until the flight arrives", async () => {
    holdLink("f1", URL_);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    await show();
    expect(seen.loading).toBe(true);
    expect(seen.view).toBeNull();
  });
});
