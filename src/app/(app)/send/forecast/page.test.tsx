import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import { ToastContext } from "@/components/Toasts";
import {
  type SyncPayload,
  type SyncResult,
  startSync,
} from "@/components/sync";
import type { ForecastDraft } from "./draft";
import type { ForecastView } from "./ForecastView";
import ForecastPage from "./page";

type ViewProps = ComponentProps<typeof ForecastView>;

const seen = vi.hoisted(() => ({
  view: null as ViewProps | null,
  loading: false,
  router: { push: vi.fn(), replace: vi.fn() },
  toast: vi.fn(),
  drafts: new Map<string, unknown>(),
}));

vi.mock("./draft", () => ({
  readDraft: (friendId: string) => seen.drafts.get(friendId) ?? null,
  clearDraft: (friendId: string) => seen.drafts.delete(friendId),
}));
vi.mock("./ForecastView", () => ({
  ForecastView: (props: ViewProps) => {
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
vi.mock("next/navigation", () => ({
  useRouter: () => seen.router,
  useSearchParams: () => new URLSearchParams([["to", "u2"]]),
}));

const NOW = Date.parse("2026-11-20T18:00:00Z");
const HOUR = 3_600_000;

const BIRD = {
  look: "gerald",
  breed: "city",
  status: "home",
  hungry: false,
  gear: [],
  focus: 3,
  navigation: 3,
  level: 1,
  belly: 80,
  feathers: 80,
  energy: 80,
  sulking: false,
  speedMph: 45,
};

const BIRDS = [
  { ...BIRD, id: "b1", name: "Kevin", canFly: false },
  { ...BIRD, id: "b2", name: "Gerald", canFly: true },
  { ...BIRD, id: "b3", name: "Crumbs", canFly: true },
];

const DRAFT: ForecastDraft = {
  friendId: "u2",
  birdId: "b3",
  body: "Dinner Saturday?",
};

type QuoteBody = {
  recipients: { friendId: string }[];
  birdIds: string[];
  at: number[];
};

const ODDS = [0.62, 0.81, 0.94, 0.9, 0.88];

const legFor = ({ birdIds, at }: QuoteBody) => ({
  recipient: { friendId: "u2" },
  distanceMi: 81.3,
  from: { label: "Brooklyn" },
  to: { label: "Philadelphia" },
  quotes: at.map((releaseAt, i) => ({
    birdId: birdIds[0],
    releaseAt,
    leavesAt: releaseAt,
    airTimeMs: 126 * 60_000,
    durationMs: 126 * 60_000,
    arriveAt: releaseAt + 126 * 60_000,
    odds: ODDS[i],
    roostsOvernight: false,
    factors: [],
    sunsetAt: releaseAt + 4 * HOUR,
  })),
});

let quoted: { status: number; body: unknown } | null;
let released: { status: number; body: unknown };
let root: Root | null;

const sync = (offsetMs: number): SyncState => ({
  data: {
    me: { units: "mi", timezone: "America/New_York" },
    birds: BIRDS,
  } as unknown as SyncPayload,
  error: null,
  offsetMs,
  refresh: () => {},
});

const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
  const path = String(url);
  const body = JSON.parse(String(init?.body));
  const reply =
    path === "/api/flights/quote"
      ? (quoted ?? { status: 200, body: { recipients: [legFor(body)] } })
      : path === "/api/flights"
        ? released
        : { status: 404, body: {} };
  return Response.json(reply.body, { status: reply.status });
});

const callsTo = (path: string) =>
  fetchMock.mock.calls
    .filter(([url]) => String(url) === path)
    .map(([, init]) => JSON.parse(String(init?.body)));

async function show(offsetMs = 0) {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  const r = createRoot(container);
  root = r;
  await act(async () =>
    r.render(
      <SyncContext.Provider value={sync(offsetMs)}>
        <ToastContext.Provider value={seen.toast}>
          <ForecastPage />
        </ToastContext.Provider>
      </SyncContext.Provider>,
    ),
  );
}

async function syncedOffset() {
  vi.mocked(Date.now)
    .mockReturnValueOnce(NOW)
    .mockReturnValueOnce(NOW + 1);
  const result = await new Promise<SyncResult>((resolve) => {
    const s = startSync({
      fetch: async () => Response.json({ serverNow: NOW }),
      win: new EventTarget(),
      doc: Object.assign(new EventTarget(), {
        visibilityState: "visible" as const,
      }),
      everyMs: HOUR,
      timezone: "America/New_York",
      onResult: (r) => {
        s.stop();
        resolve(r);
      },
    });
  });
  if (!result.ok) throw new Error(result.message);
  return result.offsetMs;
}

const view = () => {
  if (!seen.view) throw new Error("ForecastView not shown");
  return seen.view;
};

const chipLabels = () => view().model.chips.map((c) => c.label);

beforeEach(() => {
  seen.view = null;
  seen.loading = false;
  seen.router.push.mockClear();
  seen.router.replace.mockClear();
  seen.toast.mockClear();
  seen.drafts.clear();
  seen.drafts.set("u2", DRAFT);
  fetchMock.mockClear();
  quoted = null;
  released = { status: 201, body: { flights: [{ id: "f1" }] } };
  root = null;
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  const r = root;
  await act(async () => r?.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Forecast page (ac-3)", () => {
  it("quotes the draft's bird at each forecast hour, the current one as now", async () => {
    await show();

    const [ask] = callsTo("/api/flights/quote");
    expect(ask.recipients).toEqual([{ friendId: "u2" }]);
    expect(ask.birdIds).toEqual(["b3"]);
    expect(ask.at).toHaveLength(5);
    expect(ask.at[0]).toBeGreaterThan(NOW);
    expect(ask.at[0]).toBeLessThan(NOW + 15 * 60_000);
    expect(ask.at.slice(1)).toEqual([
      Date.parse("2026-11-20T20:00:00Z"),
      Date.parse("2026-11-21T12:00:00Z"),
      Date.parse("2026-11-21T14:00:00Z"),
      Date.parse("2026-11-21T16:00:00Z"),
    ]);

    expect(view().backHref).toBe("/send/write?to=u2");
    expect(view().sending).toBe(false);
    expect(view().model.route).toBe("Brooklyn to Philadelphia, Friday");
    expect(view().model.question).toBe("When should Crumbs leave?");
    expect(chipLabels()).toEqual(["Now", "3 pm", "7 am", "9 am", "11 am"]);
    expect(view().model.chips[0].selected).toBe(true);
    expect(view().model.best?.label).toBe("Schedule for 7 am instead");
  });

  it("quotes and schedules whole milliseconds on a sync-derived clock offset", async () => {
    await show(await syncedOffset());

    const [ask] = callsTo("/api/flights/quote");
    expect(ask.at.every(Number.isInteger)).toBe(true);

    await act(async () => view().onSchedule(view().model.chips[0].at));
    const [posted] = callsTo("/api/flights");
    expect(Number.isInteger(posted.releaseAt)).toBe(true);
  });

  it("selects the chip that was picked", async () => {
    await show();
    const nineAm = view().model.chips[3];
    await act(async () => view().onPick(nineAm.at));
    expect(view().model.chips.find((c) => c.selected)?.label).toBe("9 am");
    expect(view().model.send.label).toBe("Send at 9 am anyway");
  });

  it("waits on the loader until the quote arrives", async () => {
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    await show();
    expect(seen.loading).toBe(true);
    expect(seen.view).toBeNull();
  });

  it("schedules the best hour, clears the draft and opens the tracker", async () => {
    await show();
    const best = view().model.best;
    if (!best) throw new Error("no best hour");
    await act(async () => view().onSchedule(best.at));

    expect(callsTo("/api/flights")).toEqual([
      {
        body: "Dinner Saturday?",
        sends: [{ friendId: "u2", birdId: "b3" }],
        releaseAt: Date.parse("2026-11-21T12:00:00Z"),
      },
    ]);
    expect(seen.drafts.has("u2")).toBe(false);
    expect(seen.router.push).toHaveBeenCalledWith("/flights/f1");
  });

  it("sends the now chip with no release time and opens takeoff", async () => {
    await show();
    await act(async () => view().onSend(view().model.send.releaseAt));

    const [posted] = callsTo("/api/flights");
    expect(posted).not.toHaveProperty("releaseAt");
    expect(posted.sends).toEqual([{ friendId: "u2", birdId: "b3" }]);
    expect(seen.router.push).toHaveBeenCalledWith("/send/takeoff/f1");
  });

  it("toasts a failed send and keeps the draft", async () => {
    released = {
      status: 409,
      body: { error: { code: "conflict", message: "Crumbs is out flying." } },
    };
    await show();
    await act(async () => view().onSend(undefined));

    expect(seen.toast).toHaveBeenCalledWith("Crumbs is out flying.");
    expect(seen.drafts.get("u2")).toEqual(DRAFT);
    expect(view().sending).toBe(false);
    expect(seen.router.push).not.toHaveBeenCalled();
  });

  it("forecasts the first bird that can fly and sends nothing without a draft", async () => {
    seen.drafts.clear();
    await show();

    expect(callsTo("/api/flights/quote")[0].birdIds).toEqual(["b2"]);
    expect(view().model.question).toBe("When should Gerald leave?");

    await act(async () => view().onSend(undefined));
    expect(callsTo("/api/flights")).toEqual([]);
    expect(seen.router.push).toHaveBeenCalledWith("/send/write?to=u2");
  });

  it("toasts a failed quote and goes back to the note", async () => {
    quoted = {
      status: 500,
      body: { error: { code: "internal", message: "Try again." } },
    };
    await show();
    expect(seen.toast).toHaveBeenCalledWith("Try again.");
    expect(seen.router.replace).toHaveBeenCalledWith("/send/write?to=u2");
    expect(seen.drafts.get("u2")).toEqual(DRAFT);
  });
});
