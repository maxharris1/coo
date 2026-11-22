import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { MORE_ROWS, type MoreSources } from "./more";
import MorePage from "./page";

const view = vi.hoisted(() => ({ renders: [] as MoreSources[] }));

vi.mock("./MoreView", () => ({
  MoreView: ({ sources }: { sources: MoreSources }) => {
    view.renders.push(sources);
    return null;
  },
}));

const SYNC = {
  friendsCount: 4,
  egg: { status: "incubating", deliveriesToGo: 6 },
  punchCard: { weekStart: "2026-11-16", deliveries: 6, size: 10, paid: false },
  me: { settings: { quietOn: true } },
} as unknown as SyncPayload;

const BODIES: Record<string, unknown> = {
  "/api/friends": { friends: [], guestLinks: [{ id: "g1" }] },
  "/api/notes": { notes: [], nextCursor: null, total: 23 },
  "/api/collection": {
    postmarks: [1, 2, 3, 4].map((earnedAt) => ({ city: "Leeds", earnedAt })),
    badges: [{ earnedAt: 1 }, { earnedAt: 2 }, { earnedAt: null }],
  },
};

const MOCK_LINES = [
  "4 friends, 1 invite out",
  "23 notes saved",
  "4 postmarks, 2 badges",
  "Egg hatches in 6 deliveries",
  "Punch card at 6 of 10",
  "Quiet hours are on",
];

const SYNC_ONLY_LINES = [
  null,
  null,
  null,
  "Egg hatches in 6 deliveries",
  "Punch card at 6 of 10",
  "Quiet hours are on",
];

let failing: Set<string>;
let release: () => void;
let root: Root;

function fakeFetch(url: RequestInfo | URL) {
  const path = String(url);
  if (!(path in BODIES)) {
    return Promise.reject(new Error(`unexpected fetch ${path}`));
  }
  return new Promise<Response>((resolve) => {
    const prior = release;
    release = () => {
      prior();
      resolve(
        failing.has(path)
          ? new Response(null, { status: 500 })
          : Response.json(BODIES[path]),
      );
    };
  });
}

const sync = (data: SyncPayload | null): SyncState => ({
  data,
  error: null,
  offsetMs: 0,
  refresh: () => {},
});

const lines = () =>
  MORE_ROWS.map((row) => row.sub(view.renders[view.renders.length - 1]));

async function mount() {
  root = createRoot(
    Object.assign(new EventTarget(), {
      nodeType: 1,
      tagName: "DIV",
      ownerDocument: new EventTarget(),
    }) as unknown as Element,
  );
  await act(async () =>
    root.render(
      <SyncContext.Provider value={sync(SYNC)}>
        <MorePage />
      </SyncContext.Provider>,
    ),
  );
}

const settle = () =>
  act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  view.renders.length = 0;
  failing = new Set();
  release = () => {};
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});

describe("/more page", () => {
  it("shows the walking-pigeon loader until sync has data", () => {
    const html = renderToStaticMarkup(
      <SyncContext.Provider value={sync(null)}>
        <MorePage />
      </SyncContext.Provider>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(view.renders).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the lines sync can answer first, then all six once the fetches land", async () => {
    await mount();
    expect(lines()).toEqual(SYNC_ONLY_LINES);
    await settle();
    expect(lines()).toEqual(MOCK_LINES);
  });

  it("drops only the line whose fetch failed", async () => {
    failing.add("/api/notes");
    await mount();
    await settle();
    expect(lines()).toEqual(
      MOCK_LINES.map((line) => (line === "23 notes saved" ? null : line)),
    );
  });

  it("ignores results that land after the page is gone", async () => {
    await mount();
    await act(async () => root.unmount());
    const rendered = view.renders.length;
    await settle();
    expect(view.renders).toHaveLength(rendered);
  });
});
