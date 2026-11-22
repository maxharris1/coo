import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { FlightPlan } from "@/lib/flight/engine";
import type { FlightsPage as Page } from "@/server/services/flights/list";
import type { Flight } from "@/server/services/flights/shape";
import type { FlightsViewProps } from "./FlightsView";
import FlightsPage from "./page";

const css = readFileSync(
  new URL("./Flights.module.css", import.meta.url),
  "utf8",
);

const rule = (selector: string) =>
  css.match(new RegExp(`\\.${selector}\\s*{([^}]*)}`))?.[1] ?? "";

const view = vi.hoisted(() => ({
  props: null as FlightsViewProps | null,
  toasts: [] as string[],
  toast: (message: string) => void view.toasts.push(message),
}));

vi.mock("./FlightsView", () => ({
  FlightsView: (props: FlightsViewProps) => {
    view.props = props;
    return null;
  },
}));

vi.mock("@/components/Toasts", () => ({
  useToast: () => view.toast,
}));

const { FlightsView } =
  await vi.importActual<typeof import("./FlightsView")>("./FlightsView");

const NOW = Date.UTC(2026, 10, 20, 18, 0);
const HOUR = 3_600_000;

type Leg = [
  kind: "fly" | "delay",
  startMs: number,
  endMs: number,
  from: number,
  to: number,
];

function plan(legs: Leg[]): FlightPlan {
  return {
    distanceMi: 81,
    bearingDeg: 229,
    onTimeOdds: 0.9,
    delayed: legs.some(([kind]) => kind === "delay"),
    delayKind: "none",
    arriveAtMs: legs.at(-1)![2],
    segments: legs.map(([kind, startMs, endMs, fromFrac, toFrac]) => ({
      kind,
      startMs,
      endMs,
      fromFrac,
      toFrac,
    })),
    events: [],
  };
}

const flyingAt = (frac: number, tripMs: number) =>
  plan([["fly", NOW - frac * tripMs, NOW + (1 - frac) * tripMs, 0, 1]]);

const person = (name: string) => ({
  id: name.toLowerCase(),
  name,
  handle: name.toLowerCase(),
});

function flight(id: string, bird: string, over: Partial<Flight>): Flight {
  return {
    id,
    kind: "delivery",
    status: "flying",
    bird: { id: `b-${id}`, name: bird, look: "gerald", gear: [] },
    owner: person("Max"),
    counterpart: person("Priya"),
    from: { lat: 40.73, lon: -73.99, label: "Brooklyn" },
    to: { lat: 39.95, lon: -75.17, label: "Philly" },
    releaseAt: NOW - HOUR,
    placeNames: {},
    role: "mine",
    hasNote: true,
    ...over,
  };
}

const gerald = flight("g1", "Gerald", { plan: flyingAt(0.38, 2 * HOUR) });
const kevin = flight("k1", "Kevin", {
  counterpart: person("Theo"),
  plan: plan([
    ["fly", NOW - 2 * HOUR, NOW - HOUR, 0, 0.55],
    ["delay", NOW - HOUR, NOW + HOUR, 0.55, 0.55],
    ["fly", NOW + HOUR, NOW + 2 * HOUR, 0.55, 1],
  ]),
});
const dumpling = flight("d1", "Dumpling", {
  role: "incoming",
  owner: person("Priya"),
  counterpart: person("Max"),
  plan: flyingAt(0.91, HOUR),
});
const landed = (id: string, bird: string, landedMs: number, over = {}) =>
  flight(id, bird, {
    status: "landed",
    counterpart: person("Rosa"),
    releaseAt: landedMs - 31_000,
    arriveAt: landedMs,
    distanceMi: 0.15,
    ...over,
  });
const admiral = landed("a1", "Admiral Crumbs", NOW - HOUR);
const yesterday = (id: string) => landed(id, "Brenda", NOW - 24 * HOUR);

const page = (over: Partial<Page> = {}): Page => ({
  yours: [gerald, kevin],
  incoming: [dumpling],
  landedToday: [admiral],
  earlier: [],
  nextCursor: null,
  ...over,
});

const EMPTY: Page = {
  yours: [],
  incoming: [],
  landedToday: [],
  earlier: [],
  nextCursor: null,
};

type Call = { url: URL; done: boolean; resolve: (res: Response) => void };
let calls: Call[];
let root: Root | null;

function fakeFetch(input: RequestInfo | URL) {
  const url = new URL(String(input), "https://coo.test");
  return new Promise<Response>((resolve) => {
    calls.push({ url, done: false, resolve });
  });
}

const requests = () =>
  calls.filter((c) => c.url.pathname === "/api/flights").map((c) => c.url);

async function answer(
  body: unknown,
  status = 200,
  match: (url: URL) => boolean = () => true,
) {
  const call = calls.find(
    (c) => c.url.pathname === "/api/flights" && !c.done && match(c.url),
  );
  if (!call) throw new Error("no open request to /api/flights");
  call.done = true;
  await act(async () => call.resolve(Response.json(body, { status })));
}

async function publish(flights?: Flight[], birds: unknown[] = []) {
  const sync = {
    data: {
      me: { timezone: "America/New_York", units: "mi" },
      flights,
      birds,
      serverNow: NOW,
    } as unknown as SyncPayload,
    error: null,
    offsetMs: 0,
    refresh: () => {},
  } satisfies SyncState;
  await act(async () => {
    root!.render(
      <SyncContext.Provider value={sync}>
        <FlightsPage />
      </SyncContext.Provider>,
    );
  });
}

async function mount() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  root = createRoot(container);
  await publish();
}

const props = () => {
  if (!view.props) throw new Error("FlightsView not rendered");
  return view.props;
};

const shown = () => renderToStaticMarkup(<FlightsView {...props()} />);

const linkTo = (html: string, id: string) =>
  html.match(new RegExp(`<a\\b[^>]*href="/flights/${id}"[^>]*>`, "g")) ?? [];

const progress = (html: string) =>
  html.match(/<[a-z]+\b[^>]*role="progressbar"[^>]*>/g) ?? [];

beforeEach(() => {
  calls = [];
  view.props = null;
  view.toasts.length = 0;
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(async () => {
  const r = root;
  root = null;
  if (r) await act(async () => r.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/flights loading", () => {
  it("asks for the first page and shows the loader meanwhile", async () => {
    await mount();
    expect(requests()).toHaveLength(1);
    expect(requests()[0].searchParams.has("cursor")).toBe(false);
    expect(shown()).toContain('aria-busy="true"');
  });
});

describe("/flights ready", () => {
  it("renders the header pill and the sections in order", async () => {
    await mount();
    await answer(page());
    const html = shown();
    expect(html).toMatch(/<h1[^>]*>Flights<\/h1>/);
    expect(html).toContain("2 out, 1 coming in");
    const headings = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(
      (m) => m[1],
    );
    expect(headings).toEqual(["Your birds", "Coming to you", "Landed today"]);
    for (const text of [
      "Gerald to Priya",
      "Kevin to Theo",
      "Dumpling from Priya",
      "Admiral Crumbs to Rosa, 3 blocks",
      "31 sec",
      ">Flying<",
      ">Delayed<",
      ">Almost here<",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Show earlier");
  });

  it("links every row to its tracker", async () => {
    await mount();
    await answer(page({ earlier: [yesterday("e1")], nextCursor: null }));
    const html = shown();
    for (const id of ["g1", "k1", "d1", "a1", "e1"]) {
      expect(linkTo(html, id)).toHaveLength(1);
    }
  });

  it("marks the delayed card and only that one", async () => {
    await mount();
    await answer(page());
    const html = shown();
    expect(linkTo(html, "k1")[0]).toContain('data-state="delayed"');
    expect(linkTo(html, "g1")[0]).toContain('data-state="flying"');
    expect(linkTo(html, "d1")[0]).toContain('data-state="almostHere"');
  });

  it("labels each progress bar with the percent of the way", async () => {
    await mount();
    await answer(page());
    const bars = progress(shown());
    expect(bars).toHaveLength(3);
    expect(bars[0]).toContain('aria-valuenow="38"');
    expect(bars[0]).toContain('aria-label="38 percent of the way"');
    expect(bars[0]).toContain('aria-valuemin="0"');
    expect(bars[0]).toContain('aria-valuemax="100"');
    expect(bars[1]).toContain('aria-label="55 percent of the way"');
    expect(bars[2]).toContain('aria-label="91 percent of the way"');
  });

  it("shows the empty line and no sections when nothing is out or landed", async () => {
    await mount();
    await answer(EMPTY);
    const html = shown();
    expect(html).toContain("No birds in the air. Suspiciously quiet.");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("<a ");
  });

  it("omits empty sections", async () => {
    await mount();
    await answer({ ...EMPTY, incoming: [dumpling] });
    const html = shown();
    expect(html).toContain("Coming to you");
    expect(html).not.toContain("Your birds");
    expect(html).not.toContain("Landed today");
    expect(html).not.toContain("Suspiciously quiet");
  });

  it("re-renders on a 10 second tick and stops ticking when unmounted", async () => {
    await mount();
    await answer(page());
    const before = props().nowMs;
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(props().nowMs).toBe(before + 10_000);
    const r = root!;
    root = null;
    await act(async () => r.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("/flights earlier", () => {
  it("Show earlier appends the next page by cursor without repeats", async () => {
    await mount();
    await answer(
      page({ earlier: [yesterday("e1"), yesterday("e2")], nextCursor: "c1" }),
    );
    let html = shown();
    expect(html).toMatch(/<h2[^>]*>Earlier<\/h2>/);
    expect(html).toContain("Show earlier");
    await act(async () => props().onMore());
    expect(requests().at(-1)!.searchParams.get("cursor")).toBe("c1");
    await answer(
      page({ earlier: [yesterday("e2"), yesterday("e3")], nextCursor: null }),
    );
    html = shown();
    const order = ["e1", "e2", "e3"].map((id) => {
      expect(linkTo(html, id)).toHaveLength(1);
      return html.indexOf(`href="/flights/${id}"`);
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain("Show earlier");
  });

  it("says Cancelled for a cancelled flight instead of a trip time", async () => {
    await mount();
    await answer({
      ...EMPTY,
      earlier: [
        flight("x1", "Gerald", {
          status: "cancelled",
          arriveAt: undefined,
          releaseAt: NOW - 24 * HOUR,
        }),
      ],
    });
    const html = shown();
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("Suspiciously quiet");
  });

  it("a failed page keeps the list and toasts the API's message", async () => {
    await mount();
    await answer(page({ earlier: [yesterday("e1")], nextCursor: "c1" }));
    await act(async () => props().onMore());
    await answer({ error: { message: "The logbook is stuck." } }, 500);
    expect(view.toasts).toEqual(["The logbook is stuck."]);
    const html = shown();
    expect(linkTo(html, "e1")).toHaveLength(1);
    expect(html).toContain("Show earlier");
  });
});

describe("/flights errors", () => {
  it("shows the API's message with Try again, which refetches", async () => {
    await mount();
    await answer({ error: { message: "The loft is napping." } }, 503);
    let html = shown();
    expect(html).toContain("The loft is napping.");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    await act(async () => props().onRetry());
    expect(shown()).toContain('aria-busy="true"');
    expect(requests()).toHaveLength(2);
    expect(requests()[1].searchParams.has("cursor")).toBe(false);
    await answer(page());
    html = shown();
    expect(html).toContain("Gerald to Priya");
    expect(html).not.toContain("Try again");
  });
});

describe("/flights live", () => {
  it("shows a bird on an odd job instead of the empty line", async () => {
    await mount();
    await publish(undefined, [
      {
        id: "b-gerald",
        name: "Gerald",
        look: "gerald",
        gear: [],
        status: "busy",
        busyKind: "job",
        busyUntil: NOW + HOUR,
      },
    ]);
    await answer(EMPTY);
    const html = shown();
    expect(html).toMatch(/<h2[^>]*>On odd jobs<\/h2>/);
    expect(html).toContain("Gerald, on an odd job");
    expect(html).toContain("Home at 2:00 pm");
    expect(html).not.toContain("Suspiciously quiet");
  });

  it("shows a newly incoming flight after a successful sync", async () => {
    await mount();
    await answer(EMPTY);
    await publish([dumpling]);
    expect(requests()).toHaveLength(2);
    expect(requests()[1].searchParams.has("cursor")).toBe(false);
    await answer({ ...EMPTY, incoming: [dumpling] });
    const html = shown();
    expect(linkTo(html, "d1")).toHaveLength(1);
    expect(html).not.toContain("Suspiciously quiet");
  });

  it("shows a released flight as Flying with its plan", async () => {
    const waiting = flight("s1", "Gerald", {
      status: "scheduled",
      releaseAt: NOW + HOUR,
      plan: undefined,
    });
    const released = {
      ...waiting,
      status: "flying" as const,
      plan: gerald.plan,
    };
    await mount();
    await answer({ ...EMPTY, yours: [waiting] });
    expect(shown()).toContain(">Scheduled<");
    await publish([released]);
    await answer({ ...EMPTY, yours: [released] });
    const html = shown();
    expect(html).toContain(">Flying<");
    expect(html).not.toContain(">Scheduled<");
    expect(progress(html)[0]).toContain('aria-valuenow="38"');
  });

  it("keeps loaded history and its cursor across a sync refetch", async () => {
    await mount();
    await answer(page({ earlier: [yesterday("e1")], nextCursor: "c1" }));
    await act(async () => props().onMore());
    await answer(page({ earlier: [yesterday("e2")], nextCursor: "c2" }));
    await publish([dumpling]);
    await answer(page({ earlier: [yesterday("e1")], nextCursor: "c1" }));
    const html = shown();
    for (const id of ["e1", "e2"]) expect(linkTo(html, id)).toHaveLength(1);
    await act(async () => props().onMore());
    expect(requests().at(-1)!.searchParams.get("cursor")).toBe("c2");
  });

  it("keeps a newer sync refetch when an older Show earlier page resolves after it", async () => {
    const firstPage = (url: URL) => !url.searchParams.has("cursor");
    const earlierPage = (url: URL) => url.searchParams.get("cursor") === "c1";
    await mount();
    await answer({ ...EMPTY, earlier: [yesterday("e1")], nextCursor: "c1" });
    await act(async () => props().onMore());
    await publish([dumpling]);
    await answer(
      {
        ...EMPTY,
        incoming: [dumpling],
        earlier: [yesterday("e1")],
        nextCursor: "c1",
      },
      200,
      firstPage,
    );
    expect(linkTo(shown(), "d1")).toHaveLength(1);
    await answer({ ...EMPTY, earlier: [yesterday("e2")] }, 200, earlierPage);
    const html = shown();
    expect(linkTo(html, "d1")).toHaveLength(1);
    for (const id of ["e1", "e2"]) expect(linkTo(html, id)).toHaveLength(1);
    expect(html).not.toContain("Suspiciously quiet");
  });

  it("does not refetch when a sync leaves the flights unchanged", async () => {
    await mount();
    await answer(page());
    await publish([dumpling]);
    await answer(page());
    await publish([dumpling]);
    expect(requests()).toHaveLength(2);
  });
});

describe("/flights layout", () => {
  it("gives done rows and buttons a full tap target", () => {
    expect(rule("done")).toMatch(/min-height:\s*var\(--coo-touch\)/);
    expect(rule("more")).toMatch(/min-height:\s*var\(--coo-touch\)/);
  });

  it("sizes avatars to the mock's outside edge under the global border-box", () => {
    const globals = readFileSync(
      new URL("../../globals.css", import.meta.url),
      "utf8",
    );
    const mock = readFileSync(
      new URL(
        "../../../../reference/screens/html/Flights.html",
        import.meta.url,
      ),
      "utf8",
    );
    expect(globals).toMatch(
      /\*,\s*\*::before,\s*\*::after\s*{\s*box-sizing: border-box;/,
    );
    const ref = mock.match(
      /<svg width="(\d+)" height="(\d+)" viewBox="60 2 62 62"[^>]+style="[^"]*border: (\d+)px/,
    )!;
    const outside = Number(ref[1]) + 2 * Number(ref[3]);
    const avatar = rule("avatar");
    expect(avatar).not.toMatch(/box-sizing/);
    expect(avatar).toMatch(new RegExp(`width:\\s*${outside}px`));
    expect(avatar).toMatch(new RegExp(`height:\\s*${outside}px`));
    expect(avatar).toMatch(/border:\s*var\(--coo-line-thin\)/);
  });

  it("frames cards like the mock", () => {
    const card = rule("card");
    expect(card).toMatch(/padding:\s*8px 12px 10px 8px/);
    expect(card).toMatch(/border:\s*var\(--coo-line\)/);
    expect(card).toMatch(/border-radius:\s*var\(--coo-radius-row\)/);
    expect(css).toMatch(
      /\.card\[data-state="delayed"\]\s*{[^}]*var\(--coo-peach\)/,
    );
  });
});
