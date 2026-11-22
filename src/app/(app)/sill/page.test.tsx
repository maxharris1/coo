import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import SillPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NOW = Date.parse("2026-11-20T19:00:00Z");
const MIN = 60_000;

const visit = (id: string, bird: string, leavesInMin: number): SyncVisit => ({
  id,
  bird: {
    id: `b-${id}`,
    name: bird,
    breed: "city",
    look: "gerald",
    pronoun: "they",
    speedMph: 42,
    gear: [],
  },
  owner: { id: `o-${id}`, name: "Priya", handle: "priya" },
  note: { id: `n-${id}`, body: "hi", createdAt: NOW - 90 * MIN },
  arrivedAt: NOW - 10 * MIN,
  leavesAt: NOW + leavesInMin * MIN,
  status: "waiting",
  snackGiven: false,
  returnMi: 81,
  flight: { distanceMi: 81, durationMs: 112 * MIN, delayKind: "none" },
});

const sync = (visits: SyncVisit[] | null): SyncState => ({
  data:
    visits &&
    ({
      serverNow: NOW,
      visits,
      me: { timezone: "UTC" },
    } as unknown as SyncPayload),
  error: null,
  offsetMs: 0,
  refresh: () => {},
});

const render = (visits: SyncVisit[] | null) =>
  renderToStaticMarkup(
    <SyncContext.Provider value={sync(visits)}>
      <SillPage />
    </SyncContext.Provider>,
  );

beforeEach(() => router.replace.mockClear());

describe("/sill (ac-1)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the loader until the first sync lands", () => {
    expect(render(null)).toContain('aria-busy="true"');
  });

  it("opens the Landed screen when one bird is waiting", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
    );
    const container = Object.assign(new EventTarget(), {
      nodeType: 1,
      tagName: "DIV",
      ownerDocument: new EventTarget(),
    }) as unknown as Element;
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <SyncContext.Provider value={sync([visit("v1", "Dumpling", 30)])}>
          <SillPage />
        </SyncContext.Provider>,
      ),
    );
    expect(router.replace).toHaveBeenCalledWith("/sill/v1");
    await act(async () => root.unmount());
  });

  it("lists several waiting birds soonest to leave first", () => {
    const html = render([
      visit("late", "Biscuit", 50),
      visit("soon", "Dumpling", 5),
      visit("mid", "Waffle", 20),
    ]);
    const hrefs = [...html.matchAll(/href="(\/sill\/[^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(hrefs).toEqual(["/sill/soon", "/sill/mid", "/sill/late"]);
    expect(html).toContain("Dumpling");
    expect(html).toContain("From Priya. Leaves in 5 min.");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows the empty state when nobody is waiting", () => {
    const html = render([]);
    expect(html).toContain("Nobody on your sill yet. Send the first note.");
    expect(html).toMatch(/href="\/send"/);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
