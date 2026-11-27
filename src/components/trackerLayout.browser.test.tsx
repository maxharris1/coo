import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type FlightInput,
  type FlightPlan,
  positionAt,
} from "@/lib/flight/engine";
import type { Flight } from "@/server/services/flights/shape";
import type { JobView } from "@/server/services/jobs/get";
import {
  CSS_MODULES,
  classNames,
  modulePath,
  readRepoFile,
} from "@/test/cssModules";

vi.mock("next/navigation", () => ({ usePathname: () => "/flights/f1" }));
for (const sheet of CSS_MODULES) {
  vi.doMock(modulePath(sheet), () => ({ default: classNames(sheet) }));
}

const fixture = await import("@/test/trackerFixture");
const { default: AppLayout } = await import("@/app/(app)/layout");
const { OfflineLine, BANNER_HEIGHT_VAR } = await import("@/app/OfflineBanner");
const { Tracker } = await import("./Tracker");
const { flightLog } = await import("./FlightLog");
const { JobTracker } = await import("@/app/(app)/jobs/[id]/JobTracker");
const { findButtonStyle } = await import("./MapView");

const TZ = "America/New_York";
const INSTALL = "npx playwright install chromium";

const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844, top: 59, bottom: 34, map: 200 },
  { name: "360x568", width: 360, height: 568, top: 0, bottom: 0, map: 200 },
  { name: "667x375", width: 667, height: 375, top: 0, bottom: 21, map: 120 },
];

type Vector = { name: string; input: FlightInput; plan: FlightPlan };
const vectors: Vector[] = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors;

function twoRowFlight(): { flight: Flight; nowMs: number } {
  for (const v of vectors) {
    const flight: Flight = {
      id: v.input.flightId,
      kind: "delivery",
      status: "flying",
      bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
      owner: { id: "u1", name: "Max", handle: "max" },
      counterpart: { id: "u2", name: "Priya", handle: "priya" },
      from: { ...v.input.from, label: "Brooklyn" },
      to: { ...v.input.to, label: "Philly" },
      releaseAt: v.plan.segments[0].startMs,
      arriveAt: v.plan.arriveAtMs,
      distanceMi: v.plan.distanceMi,
      plan: v.plan,
      input: v.input,
      placeNames: {},
      role: "mine",
      hasNote: true,
    };
    for (const event of v.plan.events) {
      const nowMs = event.atMs + 1000;
      if (nowMs >= v.plan.arriveAtMs) break;
      const flying =
        positionAt(v.plan, flight.from, flight.to, nowMs).state === "flying";
      if (flying && flightLog(flight, nowMs).length === 2) {
        return { flight, nowMs };
      }
    }
  }
  throw new Error("no vector gives a two-row flight log while flying");
}

const job: JobView = {
  id: "j1",
  jobId: "deli-slip",
  text: "Rush an order slip to the deli on 4th",
  short: "odd job for the deli",
  startedAt: "2026-11-22T15:00:00.000Z",
  endsAt: "2026-11-22T15:12:00.000Z",
  status: "running",
  bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
  map: {
    loft: { lat: 40.68, lon: -73.97, label: "Prospect Heights" },
    dest: { lat: 40.72, lon: -73.99, label: "the deli on 4th" },
  },
};
const JOB_NOW_MS = Date.parse("2026-11-22T15:03:00.000Z");

const offsetTo = (nowMs: number) => nowMs - Date.now();
const FROZEN_NOW_MS = Date.parse("2026-11-22T12:00:00.000Z");

const SCREENS = [
  {
    name: "Tracker",
    css: "src/components/Tracker.module.css",
    mapClass: "Tracker__map",
    offlineHash:
      "c8fd23be97d89f39f3f7bf03840346723024a3f6fb52aede6865e64ed1908886",
    render: () => {
      const { flight, nowMs } = twoRowFlight();
      return (
        <Tracker
          flight={flight}
          offsetMs={offsetTo(nowMs)}
          timeZone={TZ}
          units="mi"
        />
      );
    },
  },
  {
    name: "JobTracker",
    css: "src/app/(app)/jobs/[id]/JobTracker.module.css",
    mapClass: "JobTracker__map",
    offlineHash:
      "b74bb1e43b38620d31a98d9c1aee3849670ac91bafbce382e7cf9369ae6f061a",
    render: () => (
      <JobTracker job={job} offsetMs={offsetTo(JOB_NOW_MS)} timeZone={TZ} />
    ),
  },
];

type Hit = { y: number; ok: boolean };
type Measured = {
  map: number;
  mapBottom: number;
  barTop: number;
  trackerTop: number;
  trackerBottom: number;
  attribution: Hit;
  back: Hit;
  find: Hit | null;
  scrollY: number;
  bannerHeight: number;
  bannerBottom: number;
};

function measure(mapClass: string): Measured {
  const rect = (el: Element | null) => {
    if (!el) throw new Error("missing element");
    return el.getBoundingClientRect();
  };
  const hit = (el: Element | null): Hit => {
    const r = rect(el);
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const at = document.elementFromPoint(x, y);
    return { y, ok: at !== null && el!.contains(at) };
  };
  const map = document.querySelector(`.${mapClass}`);
  const tracker = rect(map?.parentElement ?? null);
  const banner = document.querySelector("p[role=status]");
  const find = [...document.querySelectorAll(`.${mapClass} button`)].find((b) =>
    b.textContent?.startsWith("Find "),
  );
  return {
    map: rect(map).height,
    mapBottom: rect(map).bottom,
    barTop: rect(document.querySelector("nav")).top,
    trackerTop: tracker.top,
    trackerBottom: tracker.bottom,
    attribution: hit(document.querySelector(".maplibregl-ctrl-attrib-button")),
    back: hit(document.querySelector("a[aria-label^='Back']")),
    find: find ? hit(find) : null,
    scrollY: window.scrollY,
    bannerHeight: banner ? rect(banner).height : 0,
    bannerBottom: banner ? rect(banner).bottom : 0,
  };
}

let browser: Browser;

beforeAll(async () => {
  try {
    browser = await chromium.launch();
  } catch (error) {
    throw new Error(`Chromium is missing. Run \`${INSTALL}\`.\n${error}`);
  }
});

afterAll(() => browser?.close());

afterEach(() => {
  vi.useRealTimers();
});

async function layout(
  body: ReactNode,
  mapClass: string,
  viewport: (typeof VIEWPORTS)[number],
  css?: string,
  act?: (page: Page) => Promise<void>,
) {
  const html = fixture.fixtureHtml({
    body,
    mapClass,
    insets: { top: viewport.top, bottom: viewport.bottom },
  });
  expect(html).not.toMatch(/_[\w]+_[0-9a-f]{6}/);
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  try {
    await fixture.serve(page, html);
    if (css) await page.addStyleTag({ content: css });
    if (act) await act(page);
    return {
      ...(await page.evaluate(measure, mapClass)),
      hash: createHash("sha256").update(html).digest("hex"),
    };
  } finally {
    await page.close();
  }
}

const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );

async function scrollByWheel(page: Page) {
  const title = await page.locator("a[aria-label^='Back'] + *").boundingBox();
  if (!title) throw new Error("missing title");
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.wheel(0, 54);
  await settle(page);
}

async function scrollToEnd(page: Page) {
  await page.evaluate(() =>
    window.scrollTo(0, document.scrollingElement!.scrollHeight),
  );
  await settle(page);
}

function panThenFind(mapClass: string) {
  return async (page: Page) => {
    const box = await page.locator(`.${mapClass} canvas`).boundingBox();
    if (!box) throw new Error("missing map canvas");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 40, { steps: 5 });
    await page.mouse.up();
    const button = renderToStaticMarkup(
      <button
        type="button"
        className="coo-truncate"
        style={findButtonStyle(true)}
      >
        Find Gerald
      </button>,
    );
    await page.evaluate(
      ([root, html]) =>
        document.querySelector(root)!.insertAdjacentHTML("beforeend", html),
      [`.${mapClass} > div`, button] as const,
    );
    await settle(page);
  };
}

describe.each(SCREENS)("the $name map in Chromium", (screen) => {
  it("reads the offline banner's published height", () => {
    expect(readRepoFile(screen.css)).toContain(`var(${BANNER_HEIGHT_VAR}`);
  });

  describe.each(VIEWPORTS)("at $name", (viewport) => {
    it(`keeps a map of at least ${viewport.map}px above the tab bar`, async () => {
      const m = await layout(
        <AppLayout>{screen.render()}</AppLayout>,
        screen.mapClass,
        viewport,
      );
      expect(m.map).toBeGreaterThanOrEqual(viewport.map);
      expect(m.trackerTop).toBe(0);
      expect(m.trackerBottom).toBeCloseTo(m.barTop, 1);
      expect(m.mapBottom).toBeLessThanOrEqual(m.barTop);
    });

    it("lets a tap reach the attribution above the tab bar", async () => {
      const m = await layout(
        <AppLayout>{screen.render()}</AppLayout>,
        screen.mapClass,
        viewport,
      );
      expect(m.attribution.ok).toBe(true);
      expect(m.attribution.y).toBeLessThan(m.barTop);
      expect(m.back.ok).toBe(true);
    });

    it("misses the attribution when its button ignores the pointer", async () => {
      const m = await layout(
        <AppLayout>{screen.render()}</AppLayout>,
        screen.mapClass,
        viewport,
        ".maplibregl-ctrl-attrib-button { pointer-events: none; }",
      );
      expect(m.attribution.ok).toBe(false);
    });
  });

  it("starts under the offline banner and still ends at the tab bar", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: FROZEN_NOW_MS });
    const m = await layout(
      <>
        <OfflineLine />
        <AppLayout>{screen.render()}</AppLayout>
      </>,
      screen.mapClass,
      VIEWPORTS[0],
    );
    expect(m.hash).toBe(screen.offlineHash);
    expect(m.bannerHeight).toBeGreaterThan(0);
    expect(m.trackerTop).toBeCloseTo(m.bannerHeight, 1);
    expect(m.trackerBottom).toBeCloseTo(m.barTop, 1);
    expect(m.map).toBeGreaterThanOrEqual(VIEWPORTS[0].map);
    expect(m.back.ok).toBe(true);
    expect(m.back.y).toBeGreaterThan(m.bannerBottom);
    expect(m.attribution.ok).toBe(true);
    expect(m.attribution.y).toBeLessThan(m.barTop);
  });

  describe.each(VIEWPORTS)("offline at $name", (viewport) => {
    it(`keeps a map of at least ${viewport.map}px under the banner and above the tab bar`, async () => {
      const m = await layout(
        <>
          <OfflineLine />
          <AppLayout>{screen.render()}</AppLayout>
        </>,
        screen.mapClass,
        viewport,
      );
      expect(m.bannerHeight).toBeGreaterThan(0);
      expect(m.map).toBeGreaterThanOrEqual(viewport.map);
      expect(m.trackerTop).toBeCloseTo(m.bannerHeight, 1);
      expect(m.trackerBottom).toBeCloseTo(m.barTop, 1);
      expect(m.mapBottom).toBeLessThanOrEqual(m.barTop);
    });
  });

  it.each([
    ["a wheel over the title", scrollByWheel],
    ["scrolling to the end", scrollToEnd],
  ])("keeps Back below the offline banner after %s", async (_, scroll) => {
    const m = await layout(
      <>
        <OfflineLine />
        <AppLayout>{screen.render()}</AppLayout>
      </>,
      screen.mapClass,
      VIEWPORTS[0],
      undefined,
      scroll,
    );
    expect(m.bannerHeight).toBeGreaterThan(0);
    expect(m.back.ok).toBe(true);
    expect(m.back.y).toBeGreaterThan(m.bannerBottom);
  });

  it.each([
    ["online", false],
    ["offline", true],
  ])(
    "lets a tap reach Find Gerald after a pan at 360x568 %s",
    async (_, offline) => {
      const m = await layout(
        <>
          {offline && <OfflineLine />}
          <AppLayout>{screen.render()}</AppLayout>
        </>,
        screen.mapClass,
        VIEWPORTS[1],
        undefined,
        panThenFind(screen.mapClass),
      );
      expect(m.find).not.toBeNull();
      expect(m.find!.ok).toBe(true);
      expect(m.find!.y).toBeGreaterThan(m.bannerBottom);
      expect(m.back.ok).toBe(true);
    },
  );
});
