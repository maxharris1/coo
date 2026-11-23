import { readFileSync } from "node:fs";
import {
  act,
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
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

const card = (html: string, id: string) =>
  html.match(
    new RegExp(`<a\\b[^>]*href="/flights/${id}"[^>]*>[\\s\\S]*?</a>`),
  )?.[0] ?? "";

const headingsOf = (html: string) =>
  [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);

const groupsOf = (html: string) =>
  [...html.matchAll(/<button\b[^>]*aria-expanded="(true|false)"[^>]*>/g)].map(
    (m) => [m[0].match(/aria-label="([^"]*)"/)?.[1], m[1]],
  );

const groupBody = (html: string, title: string) => {
  const id = html.match(
    new RegExp(`aria-controls="([^"]*)"[^>]*aria-label="${title},`),
  )?.[1];
  return (
    html.match(new RegExp(`<div[^>]*id="${id}"[^>]*>[\\s\\S]*?</div>`))?.[0] ??
    ""
  );
};

type Clickable = ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
  "aria-label"?: string;
}>;

const buttonsIn = (node: ReactNode): Clickable[] => {
  if (!isValidElement<Clickable["props"]>(node)) return [];
  const own = node.type === "button" ? [node] : [];
  return [...own, ...Children.toArray(node.props.children).flatMap(buttonsIn)];
};

const header = (title: string) => {
  const found = buttonsIn(FlightsView(props())).find((b) =>
    b.props["aria-label"]?.startsWith(`${title},`),
  );
  if (!found) throw new Error(`no ${title} header`);
  return found;
};

const hops = (text: string) => {
  const found = buttonsIn(FlightsView(props())).find(
    (b) => b.props.children === text,
  );
  if (!found) throw new Error(`no ${text} button`);
  return found;
};

const hopsButton = (html: string, text: string) =>
  html.match(new RegExp(`<button\\b[^>]*>${text}</button>`))?.[0] ?? "";

const regionOf = (html: string, id: string) =>
  html.match(new RegExp(`<div[^>]*id="${id}"[^>]*>[\\s\\S]*?</div>`))?.[0] ??
  "";

const air = (html: string) =>
  html.match(/<h2[^>]*>In the air<\/h2>[\s\S]*?<\/section>/)?.[0] ?? "";

const jobRequests = () =>
  calls
    .filter((c) => c.url.pathname.startsWith("/api/jobs/"))
    .map((c) => c.url.pathname);

async function answerJob(id: string, body: unknown) {
  const call = calls.find(
    (c) => c.url.pathname === `/api/jobs/${id}` && !c.done,
  );
  if (!call) throw new Error(`no open request to /api/jobs/${id}`);
  call.done = true;
  await act(async () => call.resolve(Response.json(body)));
}

const accessibleName = (html: string, id: string) =>
  linkTo(html, id)[0]?.match(/aria-label="([^"]*)"/)?.[1];

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
    expect(headings).toEqual(["In the air"]);
    expect(groupsOf(html)).toEqual([["Today, 1 flight", "true"]]);
    for (const text of [
      "Admiral Crumbs · Rosa",
      "3 blocks · 31 sec",
      ">Flying<",
      ">Delayed<",
      ">Almost here<",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Show more");
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

  it("lists my flights then incoming ones as In the air cards", async () => {
    await mount();
    await answer(page());
    const html = shown();
    const air = html.match(/<h2[^>]*>In the air<\/h2>[\s\S]*?<\/section>/)![0];
    const order = [...air.matchAll(/href="\/flights\/([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(order).toEqual(["g1", "k1", "d1"]);
  });

  it("names each card by bird, state, other person and arrival", async () => {
    await mount();
    await answer(page());
    const html = shown();
    expect(accessibleName(html, "g1")).toBe(
      "Gerald, Flying, to Priya. Lands this afternoon.",
    );
    expect(accessibleName(html, "k1")).toBe(
      "Kevin, Delayed, to Theo. Lands this afternoon.",
    );
    expect(accessibleName(html, "d1")).toBe(
      "Dumpling, Almost here, from Priya. Lands on your sill any minute now.",
    );
  });

  it("keeps the fuzzy arrival on a delayed card with no last-seen place", async () => {
    await mount();
    await answer(page());
    const html = shown();
    expect(accessibleName(html, "k1")).toMatch(/Lands /);
    expect(card(html, "k1")).toContain("Lands this afternoon.");
  });

  it("keeps the fuzzy arrival after the last-seen place on a delayed card", async () => {
    const seen = {
      ...kevin,
      placeNames: { deciles: Array(11).fill("Newark") },
    };
    await mount();
    await answer(page({ yours: [gerald, seen] }));
    const html = shown();
    expect(accessibleName(html, "k1")).toBe(
      "Kevin, Delayed, to Theo. Last seen near Newark. Lands this afternoon.",
    );
    expect(card(html, "k1")).toContain(
      "Last seen near Newark. Lands this afternoon.",
    );
  });

  it("shows the bird, chip, direction badge, other person and line on each card", async () => {
    await mount();
    await answer(page());
    const html = shown();
    const g = card(html, "g1");
    expect(g).toContain(">Gerald<");
    expect(g).toContain(">Flying<");
    expect(g).toContain('data-direction="sent"');
    expect(g).toContain(">Priya<");
    expect(g).toContain("Lands this afternoon.");
    const d = card(html, "d1");
    expect(d).toContain(">Dumpling<");
    expect(d).toContain(">Almost here<");
    expect(d).toContain('data-direction="received"');
    expect(d).toContain(">Priya<");
    expect(d).toContain("Lands on your sill any minute now.");
  });

  it("puts a decorative map preview inside each card, with no progress bar and no Find button", async () => {
    await mount();
    await answer(page());
    const html = shown();
    for (const id of ["g1", "k1", "d1"]) {
      const c = card(html, id);
      expect(c).toContain('aria-hidden="true"');
      expect(c).toContain("pin-loft.svg");
      expect(c).toContain("pin-sill.svg");
    }
    expect(progress(html)).toHaveLength(0);
    expect(html).not.toContain("percent of the way");
    expect(html).not.toMatch(/<button[^>]*>[^<]*Find/);
    expect(html).not.toContain("Find ");
  });

  it("shows the empty card under In the air and reads All home when nothing is out or landed", async () => {
    await mount();
    await answer(EMPTY);
    const html = shown();
    expect(headingsOf(html)).toEqual(["In the air"]);
    expect(air(html)).toContain("No birds in the air. Suspiciously quiet.");
    expect(html.split("Suspiciously quiet")).toHaveLength(2);
    expect(html).toContain("All home");
    expect(html).not.toContain("<a ");
  });

  it("keeps listing past flights below the empty card", async () => {
    await mount();
    await answer({
      ...EMPTY,
      landedToday: [admiral],
      earlier: [yesterday("e1")],
    });
    const html = shown();
    expect(headingsOf(html)).toEqual(["In the air"]);
    expect(groupsOf(html)).toEqual([
      ["Today, 1 flight", "true"],
      ["Yesterday, 1 flight", "false"],
    ]);
    expect(air(html)).toContain("No birds in the air. Suspiciously quiet.");
    expect(linkTo(html, "a1")).toHaveLength(1);
    expect(linkTo(html, "e1")).toHaveLength(1);
    expect(html).toContain("All home");
  });

  it("counts out and coming in on the pill once anything is in the air", async () => {
    await mount();
    await answer({ ...EMPTY, incoming: [dumpling] });
    expect(shown()).toContain("0 out, 1 coming in");
    expect(shown()).not.toContain("All home");
  });

  it("omits empty sections", async () => {
    await mount();
    await answer({ ...EMPTY, incoming: [dumpling] });
    const html = shown();
    expect(html).toContain("In the air");
    expect(groupsOf(html)).toEqual([]);
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
  it("Show more appends the next page by cursor without repeats and regroups", async () => {
    await mount();
    await answer(
      page({ earlier: [yesterday("e1"), yesterday("e2")], nextCursor: "c1" }),
    );
    let html = shown();
    expect(groupsOf(html)).toEqual([
      ["Today, 1 flight", "true"],
      ["Yesterday, 2 flights", "false"],
    ]);
    expect(html).toContain(">Show more<");
    expect(html).not.toContain("Show earlier");
    await act(async () => props().onMore());
    expect(requests().at(-1)!.searchParams.get("cursor")).toBe("c1");
    const lastWeek = landed("w1", "Brenda", NOW - 9 * 24 * HOUR);
    await answer(
      page({
        earlier: [yesterday("e2"), yesterday("e3"), lastWeek],
        nextCursor: null,
      }),
    );
    html = shown();
    expect(groupsOf(html)).toEqual([
      ["Today, 1 flight", "true"],
      ["Yesterday, 3 flights", "false"],
      ["Earlier, 1 flight", "false"],
    ]);
    const order = ["e1", "e2", "e3"].map((id) => {
      expect(linkTo(groupBody(html, "Yesterday"), id)).toHaveLength(1);
      return html.indexOf(`href="/flights/${id}"`);
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(linkTo(groupBody(html, "Earlier"), "w1")).toHaveLength(1);
    expect(html).not.toContain("Show more");
  });

  it("opens the newest group and hides the rows of collapsed ones", async () => {
    await mount();
    await answer({ ...EMPTY, earlier: [yesterday("e1")] });
    const html = shown();
    expect(groupsOf(html)).toEqual([["Yesterday, 1 flight", "true"]]);
    expect(groupBody(html, "Yesterday")).not.toMatch(/<div[^>]*hidden/);
  });

  it("toggles a group from its header button", async () => {
    await mount();
    await answer(page({ earlier: [yesterday("e1")] }));
    let html = shown();
    expect(groupBody(html, "Yesterday")).toMatch(/^<div[^>]*hidden=""/);
    expect(groupBody(html, "Today")).not.toMatch(/^<div[^>]*hidden/);
    await act(async () => header("Yesterday").props.onClick?.());
    await act(async () => header("Today").props.onClick?.());
    html = shown();
    expect(groupsOf(html)).toEqual([
      ["Today, 1 flight", "false"],
      ["Yesterday, 1 flight", "true"],
    ]);
    expect(groupBody(html, "Yesterday")).not.toMatch(/^<div[^>]*hidden/);
    expect(groupBody(html, "Today")).toMatch(/^<div[^>]*hidden=""/);
    expect(linkTo(groupBody(html, "Yesterday"), "e1")).toHaveLength(1);
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
    expect(air(html)).toContain("Suspiciously quiet");
    expect(air(html)).not.toContain("/flights/x1");
  });

  it("shows a landed row as an avatar, a direction badge, bird · other and distance · trip", async () => {
    const received = landed("r1", "Brenda", NOW - 2 * HOUR, {
      role: "incoming",
      owner: person("Tracy"),
      distanceMi: 82,
      releaseAt: NOW - 2 * HOUR - (5 * HOUR + 10 * 60_000),
    });
    await mount();
    await answer({ ...EMPTY, landedToday: [admiral, received] });
    const html = shown();
    const sent = card(html, "a1");
    expect(sent).toMatch(
      /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"[^>]*aria-hidden="true"/,
    );
    expect(sent).toMatch(
      /aria-hidden="true"[^>]*data-direction="sent"|data-direction="sent"[^>]*aria-hidden="true"/,
    );
    expect(sent).toContain('class="srOnly">Sent<');
    expect(sent).toContain(">Admiral Crumbs · Rosa<");
    expect(sent).toContain(">3 blocks · 31 sec<");
    const got = card(html, "r1");
    expect(got).toContain('data-direction="received"');
    expect(got).toContain('class="srOnly">Received<');
    expect(got).toContain(">Brenda · Tracy<");
    expect(got).toContain(">82 miles · 5h 10m<");
    for (const row of [sent, got]) {
      expect(row).not.toMatch(/\bto\b|\bfrom\b/);
    }
  });

  it("folds zero-distance flights into a collapsed test hops disclosure at the bottom of their group", async () => {
    const hop = (id: string, at: number) =>
      landed(id, "Brenda", at, { distanceMi: 0 });
    await mount();
    await answer({
      ...EMPTY,
      landedToday: [
        hop("h1", NOW - 2 * HOUR),
        admiral,
        hop("h2", NOW - 3 * HOUR),
      ],
      earlier: [hop("h3", NOW - 24 * HOUR)],
    });
    let html = shown();
    expect(groupsOf(html)[0]).toEqual(["Today, 1 flight", "true"]);
    expect(html).toMatch(/aria-label="Yesterday"[^>]*>Yesterday<\/button>/);
    expect(hopsButton(html, "1 test hop")).toContain('aria-expanded="false"');
    const today = hopsButton(html, "2 test hops");
    expect(today).toContain('aria-expanded="false"');
    const region = today.match(/aria-controls="([^"]*)"/)![1];
    expect(regionOf(html, region)).toMatch(/^<div[^>]*hidden=""/);
    const todayRows = groupBody(html, "Today");
    expect(todayRows.indexOf("/flights/a1")).toBeLessThan(
      todayRows.indexOf("2 test hops"),
    );
    await act(async () => hops("2 test hops").props.onClick?.());
    html = shown();
    expect(hopsButton(html, "2 test hops")).toContain('aria-expanded="true"');
    const open = regionOf(html, region);
    expect(open).not.toMatch(/^<div[^>]*hidden/);
    for (const id of ["h1", "h2"]) expect(linkTo(open, id)).toHaveLength(1);
    expect(linkTo(open, "a1")).toHaveLength(0);
  });

  it("a failed page keeps the list and toasts the API's message", async () => {
    await mount();
    await answer(page({ earlier: [yesterday("e1")], nextCursor: "c1" }));
    await act(async () => props().onMore());
    await answer({ error: { message: "The logbook is stuck." } }, 500);
    expect(view.toasts).toEqual(["The logbook is stuck."]);
    const html = shown();
    expect(linkTo(html, "e1")).toHaveLength(1);
    expect(html).toContain("Show more");
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
    expect(accessibleName(html, "g1")).toBe(
      "Gerald, Flying, to Priya. Lands this afternoon.",
    );
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
    expect(headingsOf(html)).toEqual(["In the air"]);
    expect(html).not.toContain("On odd jobs");
    expect(air(html)).toContain("Gerald, on an odd job");
    expect(air(html)).toContain("Home this afternoon");
    expect(html).not.toContain("Suspiciously quiet");
    expect(jobRequests()).toEqual([]);
  });

  it("loads a working bird's job and shows its card under In the air, after the flights, with a preview linking to the job", async () => {
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
        jobId: "j-77",
      },
    ]);
    await answer({ ...EMPTY, incoming: [dumpling] });
    expect(jobRequests()).toEqual(["/api/jobs/j-77"]);
    expect(shown()).not.toContain('href="/jobs/j-77"');
    await answerJob("j-77", {
      job: {
        id: "j-77",
        jobId: "deli-slip",
        text: "Rush an order slip to the deli on 4th",
        short: "odd job for the deli",
        startedAt: new Date(NOW - 10 * 60_000).toISOString(),
        endsAt: new Date(NOW + HOUR).toISOString(),
        status: "running",
        bird: { id: "b-gerald", name: "Gerald", look: "gerald", gear: [] },
        map: {
          loft: { lat: 40.68, lon: -73.97, label: "Prospect Heights" },
          dest: { lat: 40.72, lon: -73.99, label: "the deli on 4th" },
        },
      },
    });
    const section = air(shown());
    const job = section.match(
      /<a\b[^>]*href="\/jobs\/j-77"[^>]*>[\s\S]*?<\/a>/,
    );
    expect(job?.[0]).toContain("Gerald, on an odd job");
    expect(job?.[0]).toContain("pin-sill.svg");
    expect(section.indexOf("/flights/d1")).toBeLessThan(
      section.indexOf("/jobs/j-77"),
    );
    expect(jobRequests()).toEqual(["/api/jobs/j-77"]);
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
    expect(accessibleName(html, "s1")).toBe(
      "Gerald, Flying, to Priya. Lands this afternoon.",
    );
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

  it("keeps a newer sync refetch when an older Show more page resolves after it", async () => {
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
    expect(rule("groupHeader")).toMatch(/min-height:\s*var\(--coo-touch\)/);
    expect(rule("hops")).toMatch(/min-height:\s*var\(--coo-touch\)/);
    expect(css).toMatch(/\.hops:focus-visible[,\s]/);
    const tokens = readFileSync(
      new URL("../../../../assets/tokens.css", import.meta.url),
      "utf8",
    );
    expect(tokens).toMatch(/--coo-touch:\s*44px/);
    expect(css).toMatch(/\.doneRows\[hidden\]\s*{[^}]*display:\s*none/);
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
    const air = rule("airCard");
    expect(air).toMatch(/border:\s*var\(--coo-line\)/);
    expect(air).toMatch(/border-radius:\s*var\(--coo-radius-row\)/);
    expect(css).toMatch(
      /\.airCard\[data-state="delayed"\] \.airBody\s*{[^}]*var\(--coo-peach\)/,
    );
  });
});
