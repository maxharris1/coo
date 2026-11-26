import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpolate, type FlightPlan, type LatLon } from "@/lib/flight/engine";
import {
  FakeMap,
  type FakeElement,
  fakeDocument,
  find,
  maps,
  markers,
  nextFrame,
  nextMap,
  renderWithEffects,
  resetFakes,
  styleFailures,
  styleLoads,
  stubBrowser,
  stubStyle,
} from "@/test/fakeMapLibre";
import { ATTRIBUTION_OPEN_MS } from "./attribution";
import { Bird } from "./Bird";
import { STOCK_STYLE } from "./mapStyle";
import {
  FAR_ZOOM,
  MapView,
  cloudFade,
  cloudScale,
  dotsStart,
  ZOOM_BANDS,
  headsWest,
  nearEdge,
  pinLabelShift,
  routeFractions,
  zoomForDistance,
  type BirdState,
  type MapViewProps,
} from "./MapView";

vi.mock(
  "maplibre-gl",
  async () => (await import("@/test/fakeMapLibre")).fakeMaplibre,
);
vi.mock("@/components/mapStyle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/mapStyle")>()),
  ...(await import("@/test/fakeMapLibre")).fakeMapStyle,
}));

vi.mock("react", async (importOriginal) =>
  (await import("@/test/fakeMapLibre")).fakeReact(
    await importOriginal<typeof import("react")>(),
  ),
);

describe("zoomForDistance", () => {
  it.each([
    [0, 16],
    [0.99, 16],
    [1, 14],
    [4.99, 14],
    [5, 11],
    [29.99, 11],
    [30, 8],
    [149.99, 8],
    [150, 6],
    [599.99, 6],
    [600, 4.5],
    [3000, 4.5],
  ])("%d miles left zooms to %d", (miles, zoom) => {
    expect(zoomForDistance(miles)).toBe(zoom);
  });

  it("uses the docs/09 bands and far zoom", () => {
    expect(ZOOM_BANDS).toEqual([
      { underMi: 1, zoom: 16 },
      { underMi: 5, zoom: 14 },
      { underMi: 30, zoom: 11 },
      { underMi: 150, zoom: 8 },
      { underMi: 600, zoom: 6 },
    ]);
    expect(FAR_ZOOM).toBe(4.5);
  });
});

describe("headsWest", () => {
  it("is true when the destination lies west", () => {
    expect(
      headsWest({ lat: 40.7, lon: -74 }, { lat: 34.05, lon: -118.24 }),
    ).toBe(true);
  });

  it("is false when the destination lies east", () => {
    expect(
      headsWest({ lat: 34.05, lon: -118.24 }, { lat: 40.7, lon: -74 }),
    ).toBe(false);
  });
});

describe("routeFractions", () => {
  it("samples every 1% up to 300 miles", () => {
    const f = routeFractions(300);
    expect(f).toHaveLength(101);
    expect(f[0]).toBe(0);
    expect(f[1]).toBeCloseTo(0.01);
    expect(f.at(-1)).toBe(1);
  });

  it("samples every 0.2% above 300 miles", () => {
    const f = routeFractions(301);
    expect(f).toHaveLength(501);
    expect(f[1]).toBeCloseTo(0.002);
    expect(f.at(-1)).toBe(1);
  });
});

const FLY_VB = 'viewBox="-24 -12 164 120"';
const PERCH_VB = 'viewBox="-10 -22 140 132"';
const SURPRISE_MARKS = "M112 14 L120 4";
const SNOOZE = "coo-snooze";

const calm: { input: { from: LatLon; to: LatLon }; plan: FlightPlan } =
  JSON.parse(
    readFileSync(
      join(process.cwd(), "reference/flight-engine/vectors.json"),
      "utf8",
    ),
  ).vectors[0];

function mapBird(state?: BirdState): string {
  const html = renderToStaticMarkup(
    <MapView
      flightId="f1"
      from={{ ...calm.input.from, label: "Brooklyn" }}
      to={{ ...calm.input.to, label: "Philly" }}
      plan={calm.plan}
      distanceMi={calm.plan.distanceMi}
      bird={{ id: "b1", name: "Gerald", look: "gerald", gear: [] }}
      offsetMs={0}
      bottomPadding={0}
      night={false}
      loftLabel="Your loft"
      sillLabel="Philly"
      state={state}
    />,
  );
  const svg = html.match(/<svg[^>]*aria-label="Gerald"[^>]*>.*?<\/svg>/s);
  if (!svg) throw new Error("MapView rendered no bird");
  return svg[0];
}

describe("the map bird pose follows the tracker state", () => {
  it.each<[BirdState, string, string, string | null]>([
    ["flying", "fly", FLY_VB, null],
    ["scheduled", "perched", PERCH_VB, null],
    ["roosting", "sleep", PERCH_VB, SNOOZE],
    ["delayed", "surprise", PERCH_VB, SURPRISE_MARKS],
    ["landed", "landed", PERCH_VB, null],
  ])("%s draws the %s pose", (state, _pose, viewBox, mark) => {
    const svg = mapBird(state);
    expect(svg).toContain(viewBox);
    expect(svg.includes("coo-fly-core"), "wing flap").toBe(state === "flying");
    expect(svg.includes("coo-fly-tail"), "tail flap").toBe(state === "flying");
    if (mark) expect(svg).toContain(mark);
  });

  it("tells landed from perched by the hop", () => {
    expect(mapBird("landed")).toContain("coo-hop");
    expect(mapBird("scheduled")).not.toContain("coo-hop");
  });

  it("keeps flying when no state is given, as on a job map", () => {
    const svg = mapBird();
    expect(svg).toContain(FLY_VB);
    expect(svg).toContain("coo-fly-core");
  });
});

function props(over: Partial<MapViewProps> = {}): MapViewProps {
  return {
    flightId: "f1",
    from: { ...calm.input.from, label: "Brooklyn" },
    to: { ...calm.input.to, label: "Philly" },
    plan: calm.plan,
    distanceMi: calm.plan.distanceMi,
    bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
    offsetMs: 0,
    bottomPadding: 260,
    night: false,
    loftLabel: "Your loft",
    sillLabel: "Philly",
    ...over,
  };
}

async function mounted(p: MapViewProps) {
  const tree = renderWithEffects(MapView, p);
  await vi.waitFor(() => expect(maps).toHaveLength(1));
  nextFrame();
  return { tree, map: maps[0] };
}

const midFlight = () =>
  calm.plan.segments[0].startMs +
  (calm.plan.arriveAtMs - calm.plan.segments[0].startMs) / 2;

describe("the map preview variant (#901 ac-1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(midFlight());
    stubBrowser(vi);
  });

  afterEach(() => {
    resetFakes();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("mounts a non-interactive map fitted to the whole route with compact attribution", async () => {
    const { map } = await mounted(props({ preview: true }));
    expect(map.options.interactive, "no pan or zoom").toBe(false);
    expect(map.options.attributionControl).toEqual({ compact: true });
    expect(map.options.bounds, "fitted to the route").toBeDefined();
    expect(map.options.fitBoundsOptions, "room for pins and credit").toEqual({
      padding: { top: 46, left: 24, right: 24, bottom: 34 },
    });
  });

  it("never moves the camera and listens for no drags or zooms", async () => {
    const { map } = await mounted(props({ preview: true }));
    vi.advanceTimersByTime(60_000);
    expect(map.eased, "no follow").toBe(0);
    expect(map.handlers.dragstart ?? []).toHaveLength(0);
    expect(map.handlers.zoomstart ?? []).toHaveLength(0);
  });

  it("still draws the route on the preview", async () => {
    const { map } = await mounted(props({ preview: true }));
    map.fire("style.load");
    expect(map.layers).toEqual([
      "route-left",
      "route-flown-casing",
      "route-flown",
    ]);
  });

  it("has no pin labels and no Find button", () => {
    const html = renderToStaticMarkup(
      <MapView {...props({ preview: true })} />,
    );
    expect(html).not.toContain("Your loft");
    expect(html).not.toContain(">Philly<");
    expect(html).not.toContain("Find");
  });

  it("shrinks the open credit to one small line with no (i)", () => {
    const html = renderToStaticMarkup(
      <MapView {...props({ preview: true })} />,
    );
    expect(html).toContain('data-preview="true"');
    const css = readFileSync(
      join(process.cwd(), "src/components/MapView.module.css"),
      "utf8",
    );
    const rule = css.match(
      /\.frame\[data-preview\] :global\(\.maplibregl-ctrl-attrib\.maplibregl-compact\),[^{]*\{([^}]*)\}/,
    )?.[1];
    expect(rule).toContain("white-space: nowrap");
    expect(rule).toContain("font: 700 9px/16px var(--coo-font-body)");
    expect(css).toMatch(
      /\.frame\[data-preview\] :global\(\.maplibregl-ctrl-attrib-button\) \{\s*display: none;/,
    );
  });

  it("hides the picture from assistive tech but not the map credit", async () => {
    const html = renderToStaticMarkup(
      <MapView {...props({ preview: true })} />,
    );
    expect(html, "the frame, credit and all, stays in the tree").toMatch(
      /^(<link[^>]*>)*<div class="[^"]*frame[^"]*"(?![^>]*aria-hidden)/,
    );
    const { map } = await mounted(props({ preview: true }));
    expect(map.canvasContainer.attributes).toEqual({ "aria-hidden": "true" });
  });

  it("perches the bird at the origin when there is no plan", async () => {
    const p = props({ preview: true, plan: null, state: "flying" });
    const { tree } = await mounted(p);
    expect(find(tree, Bird)?.props).toMatchObject({ pose: "perched" });
    expect(markers[2].lngLat).toEqual([p.from.lon, p.from.lat]);
  });

  it.each<BirdState>(["scheduled", "flying", "roosting", "delayed", "landed"])(
    "perches a %s bird with no plan at the origin with nothing flown",
    async (state) => {
      const p = props({ preview: true, plan: null, state });
      const { tree, map } = await mounted(p);
      map.fire("style.load");
      const origin = [p.from.lon, p.from.lat];
      expect(find(tree, Bird)?.props).toMatchObject({ pose: "perched" });
      expect(markers[2].lngLat).toEqual(origin);
      expect(map.sources["route-flown"].data).toMatchObject({
        geometry: { coordinates: [origin] },
      });
    },
  );

  it("drops the Find button when a dragged tracker becomes a preview", async () => {
    const { map } = await mounted(props());
    map.handlers.dragstart[0]({ originalEvent: {} });
    const tracker = renderWithEffects(MapView, props());
    expect(find(tracker, "button"), "Find shows on the tracker").toBeDefined();
    const preview = renderWithEffects(MapView, props({ preview: true }));
    expect(find(preview, "button")).toBeUndefined();
  });

  it("keeps Find {bird.name} on-screen with a long bird name (#925 ac-5)", async () => {
    const long = props();
    long.bird = { ...long.bird, name: "Sir Bartholomew Featherstonehaugh" };
    const { map } = await mounted(long);
    map.handlers.dragstart[0]({ originalEvent: {} });
    const button = find(renderWithEffects(MapView, long), "button") as {
      props: { className?: string; style: Record<string, unknown> };
    };
    expect(button.props.className).toBe("coo-truncate");
    expect(button.props.style).toMatchObject({
      right: 16,
      maxWidth: "calc(100% - 32px)",
    });
  });
});

describe("the tracker map without preview stays as it was (#901 ac-1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(midFlight());
    stubBrowser(vi);
  });

  afterEach(() => {
    resetFakes();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("is interactive, padded for the card and follows the bird", async () => {
    const { map } = await mounted(props());
    expect(map.options.interactive).toBeUndefined();
    expect(map.options.fitBoundsOptions, "card plus the credit's row").toEqual({
      padding: { top: 80, left: 48, right: 48, bottom: 260 + 40 },
    });
    expect(map.handlers.dragstart).toHaveLength(1);
    expect(map.handlers.zoomstart).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(map.eased, "follows a bird near the edge").toBe(1);
  });

  it("keeps the header's room at the top when given one", async () => {
    const { map } = await mounted(props({ topPadding: 120 }));
    expect(map.options.fitBoundsOptions).toEqual({
      padding: { top: 120, left: 48, right: 48, bottom: 300 },
    });
  });

  it("refits the route to a card that changes height, on the same map", async () => {
    const p = props();
    const { map } = await mounted(p);
    renderWithEffects(MapView, { ...p, bottomPadding: 329, topPadding: 96 });
    expect(maps, "not rebuilt").toHaveLength(1);
    expect(map.fitted).toEqual([
      {
        bounds: map.options.bounds,
        options: {
          padding: { top: 96, bottom: 329 + 40, left: 48, right: 48 },
          duration: 300,
        },
      },
    ]);
  });

  it("keeps the credit's row above the card clear of the bird and pins", async () => {
    const p = props({ bottomPadding: 300, controlsBottom: 300 });
    const { map } = await mounted(p);
    const bottom = (
      map.options.fitBoundsOptions as { padding: { bottom: number } }
    ).padding.bottom;
    expect(bottom - 300, "room for the 24 px credit, its margin and air").toBe(
      40,
    );
  });

  it("counts a bird in the credit's row as at the edge, so the camera follows it", () => {
    const at = (y: number) =>
      ({
        project: () => ({ x: 200, y }),
        getContainer: () => ({ clientWidth: 400, clientHeight: 800 }),
      }) as never;
    const bird = { lat: 0, lon: 0 };
    // 20 px above a 300 px card: clear of the card, but in the credit's row.
    expect(nearEdge(at(480), bird, { top: 80, bottom: 300 })).toBe(false);
    expect(nearEdge(at(480), bird, { top: 80, bottom: 340 })).toBe(true);
    expect(nearEdge(at(400), bird, { top: 80, bottom: 340 })).toBe(false);
  });

  it("leaves the camera alone once it follows the bird or the reader pans", async () => {
    const p = props();
    const { map } = await mounted(p);
    map.fire("dragstart", { originalEvent: {} });
    renderWithEffects(MapView, { ...p, bottomPadding: 329 });
    expect(map.fitted).toEqual([]);
  });

  it("names the picture, not the credit beside it, when given a map label", async () => {
    const p = props({ mapLabel: "Live map." });
    const { map } = await mounted(p);
    expect(map.canvasContainer.attributes).toEqual({
      role: "img",
      "aria-label": "Live map.",
    });
    const tree = renderWithEffects(MapView, p) as {
      props: Record<string, unknown>;
    };
    expect(tree.props.role, "the frame hands the name over").toBeUndefined();
    expect(tree.props["aria-label"]).toBeUndefined();
  });

  it("keeps the name on the frame until the map draws, or if it never does", () => {
    const html = renderToStaticMarkup(
      <MapView {...props({ mapLabel: "Live map." })} />,
    );
    expect(html).toMatch(
      /^(<link[^>]*>)*<div class="[^"]*frame[^"]*" role="img" aria-label="Live map\."/,
    );
  });

  it("shows pin labels and keeps the map in the accessibility tree", () => {
    const html = renderToStaticMarkup(<MapView {...props()} />);
    expect(html).not.toContain("aria-hidden");
    expect(html).toContain("Your loft");
    expect(html).toContain(">Philly<");
  });

  it("flies the bird along the plan", async () => {
    const p = props();
    const { tree } = await mounted(p);
    expect(find(tree, Bird)?.props).toMatchObject({ pose: "fly" });
    expect(markers[2].lngLat).not.toEqual([p.from.lon, p.from.lat]);
  });
});

describe("pin pills sit beside their pins (#966 ac-5)", () => {
  const PAD = 16;
  const GAP = 4;
  const PIN_HALF = 16;
  const CAPS = { loft: 160, sill: 180 } as const;
  const MEASURED = {
    "Enrico Palazzo, Tudor City": 147.6,
    "Bartholomew Featherstonehaugh, Upper East Side": 289.5,
    "Your sill": 46.1,
    "Your loft": 49,
  };
  const PILL_CHROME = 2 * 10 + 2 * 2;
  const boxOf = (
    pinX: number,
    label: keyof typeof MEASURED,
    pin: keyof typeof CAPS,
    mapWidth: number,
  ) => {
    const { side, maxWidth } = pinLabelShift({
      pinX,
      pinHalfWidth: PIN_HALF,
      mapWidth,
      cap: CAPS[pin],
      pad: PAD,
      gap: GAP,
    });
    const width = Math.min(MEASURED[label] + PILL_CHROME, maxWidth);
    const left =
      side === "right" ? pinX + PIN_HALF + GAP : pinX - PIN_HALF - GAP - width;
    return { side, maxWidth, left, right: left + width };
  };

  describe.each([390, 320])("on a %ipx tracker", (mapWidth) => {
    const cases = [
      ["Enrico Palazzo, Tudor City", "sill"],
      ["Bartholomew Featherstonehaugh, Upper East Side", "sill"],
      ["Your loft", "loft"],
      ["Your sill", "loft"],
    ] as const;

    it.each(
      cases.flatMap(([label, pin]) =>
        [
          10,
          40,
          mapWidth / 2 - 1,
          mapWidth / 2 + 1,
          mapWidth - 40,
          mapWidth - 10,
        ].map((pinX) => [label, pin, pinX] as const),
      ),
    )(
      "puts the %s pill (%s) at x %d on the roomier side, inside the map and off the pin",
      (label, pin, pinX) => {
        const { side, maxWidth, left, right } = boxOf(
          pinX,
          label,
          pin,
          mapWidth,
        );
        expect(side).toBe(pinX < mapWidth / 2 ? "right" : "left");
        expect(maxWidth).toBeLessThanOrEqual(CAPS[pin]);
        expect(left).toBeGreaterThanOrEqual(PAD);
        expect(right).toBeLessThanOrEqual(mapWidth - PAD);
        const coversPin = left < pinX + PIN_HALF && right > pinX - PIN_HALF;
        expect(coversPin).toBe(false);
      },
    );
  });

  it("caps the loft pill at 160 and the recipient pill at 180 with room to spare", () => {
    const at = (cap: number) =>
      pinLabelShift({
        pinX: 20,
        pinHalfWidth: PIN_HALF,
        mapWidth: 1000,
        cap,
        pad: PAD,
        gap: GAP,
      });
    expect(at(CAPS.loft)).toEqual({ side: "right", maxWidth: 160 });
    expect(at(CAPS.sill)).toEqual({ side: "right", maxWidth: 180 });
  });

  it("styles the pills as one-line cream Nunito 900 12px pills with a 2px ink outline", () => {
    const html = renderToStaticMarkup(
      <MapView
        {...props({
          sillLabel: "Bartholomew Featherstonehaugh, Upper East Side",
        })}
      />,
    );
    const span = (text: string) =>
      html.match(new RegExp(`<span style="[^"]*">${text}[^<]*</span>`))?.[0] ??
      "";
    const loft = span("Your loft");
    const sill = span("Bartholomew");
    for (const s of [loft, sill]) {
      expect(s).toContain("background:var(--coo-card)");
      expect(s).toContain("border:2px solid var(--coo-ink)");
      expect(s).toContain("font:900 12px var(--coo-font-body)");
      expect(s).toContain("padding:4px 10px");
      expect(s).toContain("white-space:nowrap");
      expect(s).toContain("overflow:hidden");
      expect(s).toContain("text-overflow:ellipsis");
    }
    expect(loft).toContain("max-width:160px");
    expect(sill).toContain("max-width:180px");
  });

  describe("on the live map", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
      vi.setSystemTime(midFlight());
      stubBrowser(vi);
    });

    afterEach(() => {
      resetFakes();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    type Label = { style: Record<string, string>; offsetWidth: number };
    const labelsIn = (tree: unknown) => {
      const spans: Label[] = [];
      const walk = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(walk);
        const el = node as {
          type?: unknown;
          props?: { children?: unknown; ref?: { current: Label } };
        };
        if (el.type === "span" && el.props?.ref) {
          spans.push(el.props.ref.current);
        }
        walk(el.props?.children);
      };
      walk(tree);
      return spans;
    };

    it.each(["load", "move", "resize"])(
      "puts both pills beside their pins on %s",
      async (event) => {
        const { tree, map } = await mounted(props());
        const [loft, sill] = labelsIn(tree);
        map.width = 390;
        map.point = { x: 350, y: 0 };
        map.fire(event);
        expect(loft.style.right).toBe("calc(100% + 4px)");
        expect(loft.style.left).toBe("auto");
        expect(loft.style.maxWidth).toBe("160px");
        expect(sill.style.maxWidth).toBe("180px");

        map.point = { x: 40, y: 0 };
        map.fire(event);
        expect(loft.style.left).toBe("calc(100% + 4px)");
        expect(loft.style.right).toBe("auto");
      },
    );

    it("shrinks a pill when its side has less room than the cap", async () => {
      const { tree, map } = await mounted(props());
      const [, sill] = labelsIn(tree);
      map.width = 320;
      map.point = { x: 170, y: 0 };
      map.fire("move");
      expect(sill.style.maxWidth).toBe(`${170 - 16 - 4 - 16}px`);
    });

    describe.each([390, 320])(
      "panned into the next world copy at zoom 3 on a %ipx tracker",
      (mapWidth) => {
        it("puts the sill pill on the left of its wrapped pin", async () => {
          const p = props();
          const { tree, map } = await mounted(p);
          const [, sillLabel] = labelsIn(tree);
          const sillPin = markers[1];
          const zoom = 3;
          const worldPx = 512 * 2 ** zoom;
          const pinX = mapWidth - 10;
          map.width = mapWidth;
          map.camera = {
            lng: p.to.lon + 360 - ((pinX - mapWidth / 2) / worldPx) * 360,
            zoom,
          };

          map.fire("move");

          expect(sillPin.getLngLat().lng).toBeCloseTo(p.to.lon + 360);
          expect(map.project([sillPin.getLngLat().lng, 0]).x).toBeCloseTo(pinX);
          expect(sillLabel.style.right).toBe("calc(100% + 4px)");
          expect(sillLabel.style.maxWidth).toBe("180px");
        });
      },
    );
  });
});

type Line = { geometry: { coordinates: [number, number][] } };

describe("the flight line (#965 ac-1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(midFlight());
    stubBrowser(vi);
  });

  afterEach(() => {
    resetFakes();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function routeLayers(night: boolean) {
    const { map } = await mounted(props({ night }));
    map.fire("style.load");
    return map;
  }

  it.each([false, true])(
    "draws the flown part tomato, 5 pt with round ends, over an 8 pt ink casing (night %s)",
    async (night) => {
      const { specs } = await routeLayers(night);
      expect(specs["route-flown"]).toMatchObject({
        source: "route-flown",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#F4623F", "line-width": 5 },
      });
      expect(specs["route-flown-casing"]).toMatchObject({
        source: "route-flown",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2A2140", "line-width": 8 },
      });
    },
  );

  it("draws the part still to go as ink dots by day", async () => {
    const { specs } = await routeLayers(false);
    expect(specs["route-left"]).toMatchObject({
      source: "route-left",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": "#2A2140",
        "line-width": 3.5,
        "line-dasharray": [0.01, 2.2],
      },
    });
    expect(specs["route-left"].paint).not.toHaveProperty("line-opacity");
  });

  it("draws the dots cream at 85% at night", async () => {
    const { specs } = await routeLayers(true);
    expect(specs["route-left"]).toMatchObject({
      layout: { "line-cap": "round" },
      paint: {
        "line-color": "#FFF4DC",
        "line-opacity": 0.85,
        "line-width": 3.5,
        "line-dasharray": [0.01, 2.2],
      },
    });
  });

  it("ends the flown part under the bird and starts the dots one dot gap ahead", async () => {
    const { map } = await mounted(props());
    map.camera = {
      lng: calm.input.from.lon,
      lat: calm.input.from.lat,
      zoom: 8,
    };
    map.fire("style.load");
    expectOneGapAhead(map, calm.input.to);
  });
});

const DOT_GAP_PX = 2.2 * 3.5;

function px(map: FakeMap, a: [number, number], b: [number, number]) {
  const p = map.project(a);
  const q = map.project(b);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

function expectOneGapAhead(map: FakeMap, to: LatLon) {
  const flown = (map.sources["route-flown"].data as Line).geometry.coordinates;
  const left = (map.sources["route-left"].data as Line).geometry.coordinates;
  const bird = markers[2].lngLat!;
  expect(
    px(map, flown.at(-1)!, bird),
    "flown ends under the bird",
  ).toBeLessThan(0.01);
  expect(
    px(map, bird, left[0]),
    "dots start one gap from the bird",
  ).toBeCloseTo(DOT_GAP_PX, 1);
  const end: [number, number] = [left.at(-1)![0], to.lat];
  expect(px(map, left[0], end), "dots start ahead of the bird").toBeLessThan(
    px(map, bird, end),
  );
}

describe("the dots keep one dot gap ahead of the bird (#965 ac-1)", () => {
  afterEach(resetFakes);

  function gapAt(from: LatLon, to: LatLon, at: number, zoom: number) {
    const map = new FakeMap({});
    const here = interpolate(from, to, at);
    map.camera = { lng: here.lon, lat: here.lat, zoom };
    const dotsAt = dotsStart(map as never, from, to, at);
    const dot = interpolate(from, to, dotsAt);
    const lon = dot.lon + 360 * Math.round((here.lon - dot.lon) / 360);
    return {
      dotsAt,
      gap: px(map, [here.lon, here.lat], [lon, dot.lat]),
    };
  }

  it.each([0.9995, 0.9999])(
    "holds the gap when the lookahead runs past arrival (fraction %d)",
    (at) => {
      const { dotsAt, gap } = gapAt(
        { lat: 40.7, lon: -74 },
        { lat: 39.95, lon: -75.16 },
        at,
        16,
      );
      expect(gap).toBeCloseTo(DOT_GAP_PX, 2);
      expect(dotsAt, "dots still drawn before arrival").toBeLessThan(1);
    },
  );

  it("holds the gap across the antimeridian", () => {
    const { gap } = gapAt(
      { lat: 0, lon: 179 },
      { lat: 0, lon: -179 },
      0.4995,
      11,
    );
    expect(gap).toBeCloseTo(DOT_GAP_PX, 2);
  });
});

const fly = (startMs: number, endMs: number): FlightPlan => ({
  ...calm.plan,
  arriveAtMs: endMs,
  segments: [{ kind: "fly", startMs, endMs, fromFrac: 0, toFrac: 1 }],
});

describe("the drawn route follows the moving bird (#965 ac-1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    stubBrowser(vi);
  });

  afterEach(() => {
    resetFakes();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([false, true])(
    "keeps the flown end under the bird and the dots one gap ahead as time passes (preview %s)",
    async (preview) => {
      vi.setSystemTime(calm.plan.arriveAtMs - 20_000);
      const { map } = await mounted(props({ preview }));
      map.camera = { lng: calm.input.to.lon, lat: calm.input.to.lat, zoom: 16 };
      map.fire("style.load");
      vi.advanceTimersByTime(4000);
      nextFrame();
      expectOneGapAhead(map, calm.input.to);
    },
  );

  it("keeps the dots one gap ahead across the antimeridian", async () => {
    const from = { lat: 0, lon: 179, label: "East" };
    const to = { lat: 0, lon: -179, label: "West" };
    const start = calm.plan.segments[0].startMs;
    vi.setSystemTime(start + 2_999_400);
    const { map } = await mounted(
      props({ from, to, plan: fly(start, start + 6_000_000) }),
    );
    map.camera = { lng: 180, lat: 0, zoom: 11 };
    map.fire("style.load");
    nextFrame();
    expectOneGapAhead(map, to);
  });
});

describe("the bird marker (#965 ac-2)", () => {
  function markerHtml(over: Partial<MapViewProps> = {}): string {
    return renderToStaticMarkup(<MapView {...props(over)} />);
  }

  beforeEach(() => stubBrowser(vi));

  afterEach(() => {
    resetFakes();
    vi.unstubAllGlobals();
  });

  it("draws the flying bird 82 pt wide", () => {
    const tree = renderWithEffects(MapView, props());
    expect(find(tree, Bird)?.props).toMatchObject({ pose: "fly", size: 82 });
  });

  it("flips the bird when the route heads west", () => {
    const west = props();
    const east = props({ from: west.to, to: west.from });
    const flip = (p: MapViewProps) =>
      (find(renderWithEffects(MapView, p), Bird)?.props as { flip: boolean })
        .flip;
    expect(headsWest(west.from, west.to)).toBe(true);
    expect(flip(west)).toBe(true);
    expect(flip(east)).toBe(false);
  });

  it("puts the shadow 26 pt below the flying bird in the same marker", () => {
    const html = markerHtml();
    const shadow = html.match(
      /<img[^>]*src="\/assets\/svg\/map\/bird-shadow\.svg"[^>]*>/,
    );
    expect(shadow, "day shadow").not.toBeNull();
    expect(shadow![0]).toContain("calc(100% + 26px)");
    const birdAt = html.indexOf('aria-label="Gerald"');
    const shadowAt = html.indexOf(shadow![0]);
    const birdBox = html.lastIndexOf("<div", birdAt);
    expect(shadowAt, "shadow sits in the bird's marker").toBeGreaterThan(
      birdBox,
    );
  });

  it("uses the night shadow at night", () => {
    const html = markerHtml({ night: true });
    expect(html).toContain('src="/assets/svg/map/night/bird-shadow.svg"');
    expect(html).not.toContain('src="/assets/svg/map/bird-shadow.svg"');
  });

  it.each<BirdState>(["scheduled", "roosting", "delayed", "landed"])(
    "shows no shadow while %s",
    (state) => {
      expect(markerHtml({ state })).not.toContain("bird-shadow.svg");
    },
  );

  it("shows no shadow before there is a plan", () => {
    expect(markerHtml({ plan: null })).not.toContain("bird-shadow.svg");
  });
});

describe("the pigeon's speech bubble (#967 ac-3)", () => {
  const LINES = ["Gerald is over Trenton", "Gerald took off"];

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "Date",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    vi.setSystemTime(midFlight());
    vi.spyOn(Math, "random").mockReturnValue(0);
    stubBrowser(vi);
  });

  afterEach(() => {
    resetFakes();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  type Box = { style: Record<string, string>; textContent?: string };
  type El = {
    type?: unknown;
    props?: { children?: unknown; ref?: { current: Box }; src?: string };
  };
  const kids = (el: El): El[] => [el.props?.children ?? []].flat(9) as El[];
  function bubbleIn(tree: unknown) {
    const walk = (node: unknown): El | undefined => {
      if (!node || typeof node !== "object") return undefined;
      if (Array.isArray(node)) {
        for (const n of node) {
          const hit = walk(n);
          if (hit) return hit;
        }
        return undefined;
      }
      const el = node as El;
      if (kids(el).some((k) => k?.props?.src?.includes("bubble-tail"))) {
        return el;
      }
      return walk(el.props?.children);
    };
    const el = walk(tree);
    if (!el?.props?.ref) return undefined;
    const text = kids(el).find((k) => k?.type === "span");
    return { box: el.props.ref.current, text: text!.props!.ref!.current };
  }
  const shown = (b: { box: Box }) => b.box.style.display === "flex";

  it("says a flight log line for 4 s after a 20 to 40 s gap, then the next line", async () => {
    const { tree } = await mounted(props({ bubbleLines: LINES }));
    const bubble = bubbleIn(tree)!;
    vi.advanceTimersByTime(19_000);
    expect(shown(bubble)).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(shown(bubble)).toBe(true);
    expect(bubble.text.textContent).toBe(LINES[0]);
    vi.advanceTimersByTime(4_000);
    expect(shown(bubble)).toBe(false);
    vi.advanceTimersByTime(20_000);
    expect(shown(bubble)).toBe(true);
    expect(bubble.text.textContent).toBe(LINES[1]);
  });

  it("uses the newest lines passed after mount", async () => {
    const p = props({ bubbleLines: LINES });
    await mounted(p);
    const tree = renderWithEffects(MapView, { ...p, bubbleLines: ["Later"] });
    vi.advanceTimersByTime(20_000);
    expect(bubbleIn(tree)!.text.textContent).toBe("Later");
    expect(maps, "new lines do not remount the map").toHaveLength(1);
  });

  it("stays quiet while the map is dragged and hides when a drag starts", async () => {
    const { tree, map } = await mounted(props({ bubbleLines: LINES }));
    const bubble = bubbleIn(tree)!;
    vi.advanceTimersByTime(20_000);
    expect(shown(bubble)).toBe(true);
    map.handlers.dragstart[0]({ originalEvent: {} });
    expect(shown(bubble), "hidden at once").toBe(false);
    vi.advanceTimersByTime(4_000 + 20_000);
    expect(shown(bubble), "no showing mid-drag").toBe(false);
    map.fire("dragend");
    vi.advanceTimersByTime(20_000);
    expect(shown(bubble)).toBe(true);
  });

  const refreshed = async (p: MapViewProps, over: Partial<MapViewProps>) => {
    const count = maps.length;
    renderWithEffects(MapView, { ...p, ...over });
    await vi.waitFor(() => expect(maps).toHaveLength(count + 1));
    nextFrame();
  };
  const sameFlight = (p: MapViewProps): Partial<MapViewProps> => ({
    from: { ...p.from },
    to: { ...p.to },
    plan: structuredClone(p.plan),
  });

  it("keeps talking every 20 to 40 s through the 20 s sync refresh", async () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    const p = props({ bubbleLines: LINES });
    const { tree } = await mounted(p);
    const bubble = bubbleIn(tree)!;
    let seen = 0;
    for (let poll = 0; poll < 6; poll++) {
      for (let s = 0; s < 20; s++) {
        vi.advanceTimersByTime(1_000);
        if (shown(bubble)) seen++;
      }
      await refreshed(p, sameFlight(p));
    }
    expect(seen, "seconds shown in two minutes").toBeGreaterThanOrEqual(4);
  });

  it("still hides 4 s after showing when the plan changes mid-showing", async () => {
    const p = props({ bubbleLines: LINES });
    const { tree } = await mounted(p);
    const bubble = bubbleIn(tree)!;
    vi.advanceTimersByTime(20_000);
    expect(shown(bubble)).toBe(true);
    vi.advanceTimersByTime(1_000);
    await refreshed(p, { plan: structuredClone(p.plan) });
    vi.advanceTimersByTime(3_000);
    expect(shown(bubble), "hidden by the 4 s deadline").toBe(false);
  });

  it("talks again when the map is rebuilt in the middle of a drag", async () => {
    const p = props({ bubbleLines: LINES });
    const { tree, map } = await mounted(p);
    const bubble = bubbleIn(tree)!;
    map.handlers.dragstart[0]({ originalEvent: {} });
    await refreshed(p, sameFlight(p));
    vi.advanceTimersByTime(20_000);
    expect(shown(bubble)).toBe(true);
  });

  it("sits behind the westbound bird and flips within 100 pt of the right edge", async () => {
    const { tree, map } = await mounted(props({ bubbleLines: LINES }));
    const { box } = bubbleIn(tree)!;
    map.width = 390;
    map.point = { x: 200, y: 0 };
    vi.advanceTimersByTime(20_000);
    expect(box.style.left).toBe("50%");
    expect(box.style.right).toBe("auto");

    map.point = { x: 300, y: 0 };
    vi.advanceTimersByTime(24_000);
    expect(shown({ box })).toBe(true);
    expect(box.style.right).toBe("50%");
    expect(box.style.left).toBe("auto");
  });

  it("styles a cream, ink-outlined, tilted Caveat bubble that clamps to two lines", () => {
    const html = renderToStaticMarkup(
      <MapView {...props({ bubbleLines: LINES })} />,
    );
    const box = html.match(/<div[^>]*style="([^"]*rotate\(-4deg\)[^"]*)"/);
    expect(box, "tilted bubble").not.toBeNull();
    const text = html
      .slice(html.indexOf(box![0]))
      .match(/<span style="([^"]*)"/);
    const s = `${box![1]};${text![1]}`;
    expect(s).toContain("background:var(--coo-card)");
    expect(s).toContain("border:2.5px solid var(--coo-ink)");
    expect(s).toContain("border-radius:14px");
    expect(s).toContain("font:700 22px var(--coo-font-hand)");
    expect(s).toContain("color:var(--coo-ink)");
    expect(s).toContain("padding:6px 12px");
    expect(s).toContain("max-width:190px");
    expect(s).toContain("-webkit-line-clamp:2");
    expect(s).toContain("display:-webkit-box");
    expect(s).toContain("overflow:hidden");
    expect(html).toMatch(
      /<img[^>]*src="\/assets\/svg\/map\/bubble-tail\.svg"[^>]*width="14"[^>]*height="12"/,
    );
  });

  it("never talks on a preview map", async () => {
    const { tree } = await mounted(
      props({ preview: true, bubbleLines: LINES }),
    );
    expect(bubbleIn(tree)).toBeUndefined();
    expect(vi.getTimerCount(), "only the follow interval").toBe(1);
  });
});

describe("clouds drift over the map, anchored to it (#968 ac-4)", () => {
  type Host = { style: Record<string, string> };
  type Point = { x: number; y: number };
  // A map that opens fitted at zoom 5 near the route, 400 x 800.
  const OPEN = { lng: -75, lat: 40, zoom: 5 };
  const SPOTS = [
    { top: 0.18, rest: 0.35 },
    { top: 0.42, rest: 0.85 },
    { top: 0.64, rest: 0.6 },
  ];
  const CROSS_S = [32, 42, 36];
  /** Pixels a cloud drifts east on screen in one 200 ms frame. */
  const stepPx = (map: FakeMap, i: number) => (map.width / CROSS_S[i]) * 0.2;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(midFlight());
    stubBrowser(vi);
  });

  afterEach(() => {
    resetFakes();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function clouds(
    over: Partial<MapViewProps> = {},
    open: typeof nextMap = { camera: OPEN },
  ) {
    Object.assign(nextMap, open);
    pads = {
      top: over.topPadding ?? 80,
      bottom: over.bottomPadding ?? props().bottomPadding,
    };
    const { tree, map } = await mounted(props(over));
    const hosts = () => markers.slice(3).map((c) => c.options.element as Host);
    return { map, imgs: cloudImgsIn(tree), hosts };
  }

  function cloudImgsIn(node: ReactNode): Host[] {
    const out: Host[] = [];
    const walk = (n: ReactNode) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      const el = n as ReactElement<{
        children?: ReactNode;
        src?: string;
        ref?: { current: Host };
      }>;
      if (el.type === "img" && el.props.src?.endsWith("cloud.svg")) {
        out.push(el.props.ref!.current);
      }
      walk(el.props?.children);
    };
    walk(node);
    return out;
  }

  const cloudMarkers = () => markers.slice(3);
  const places = () => cloudMarkers().map((c) => c.lngLat!);
  const onScreen = (map: FakeMap) =>
    cloudMarkers().map((c) => map.project(c.getLngLat()));
  /** The header and card insets the map was last rendered with. */
  let pads = { top: 80, bottom: 260 };
  /** The clear area clouds live in: below the header, above card and credit. */
  const area = (map: FakeMap) => ({
    top: pads.top,
    bottom: map.height - pads.bottom - 40,
  });
  /** Where cloud `i` is placed, or comes back in when off the area. */
  const spotY = (map: FakeMap, i: number) => {
    const { top, bottom } = area(map);
    return top + SPOTS[i].top * (bottom - top);
  };
  /** The whole cloud box, at its size for this zoom, is off the clear area. */
  const offView = (map: FakeMap, p: Point) => {
    const scale = cloudScale(map.getZoom(), OPEN.zoom);
    const w = 74 * scale;
    const h = 36 * scale;
    const { top, bottom } = area(map);
    return (
      p.x + w / 2 <= 0 ||
      p.x - w / 2 >= map.width ||
      p.y + h / 2 <= top ||
      p.y - h / 2 >= bottom
    );
  };

  /** One 200 ms frame, as the browser would draw it. */
  function frame() {
    vi.setSystemTime(Date.now() + 200);
    nextFrame();
  }

  /**
   * Draws one frame and checks every cloud moves only by its steady drift
   * (same latitude, one step east on screen), or else jumps (comes back in)
   * with both ends wholly off the view. Returns how many clouds jumped.
   */
  function checkedFrame(map: FakeMap, label = ""): number {
    let jumps = 0;
    const before = onScreen(map);
    const was = places();
    frame();
    onScreen(map).forEach((after, i) => {
      const dx = after.x - before[i].x;
      const steady =
        Math.abs(dx - stepPx(map, i)) < 0.01 && places()[i][1] === was[i][1];
      if (steady) return;
      jumps++;
      expect(
        offView(map, before[i]),
        `${label} cloud ${i} left from view`,
      ).toBe(true);
      expect(offView(map, after), `${label} cloud ${i} came back on view`).toBe(
        true,
      );
    });
    return jumps;
  }

  /** Runs `ms` of checked frames and returns how many jumps it saw. */
  function driftChecked(map: FakeMap, ms: number): number {
    let jumps = 0;
    for (let t = 0; t < ms; t += 200) jumps += checkedFrame(map);
    return jumps;
  }

  it("draws three day clouds, or night clouds by night, 74 x 36", () => {
    for (const night of [false, true]) {
      const html = renderToStaticMarkup(<MapView {...props({ night })} />);
      const src = `/assets/svg/map/${night ? "night/" : ""}cloud.svg`;
      const imgs = html.match(/<img[^>]*cloud\.svg[^>]*>/g) ?? [];
      expect(imgs).toHaveLength(3);
      for (const img of imgs) {
        expect(img).toContain(`src="${src}"`);
        expect(img).toMatch(/width="74"[^>]*height="36"/);
        expect(img).toContain('alt=""');
      }
    }
  });

  it("are map markers spread over the opening view, just above the canvas and under the pins and bird", async () => {
    const { map, hosts } = await clouds();
    expect(cloudMarkers(), "loft, sill, bird, then three clouds").toHaveLength(
      3,
    );
    expect(new Set(hosts()).size).toBe(3);
    for (const c of cloudMarkers()) {
      expect(c.options).toMatchObject({
        rotationAlignment: "map",
        pitchAlignment: "map",
        subpixelPositioning: true,
      });
    }
    expect(map.afterCanvas, "above the canvas, below later markers").toEqual(
      hosts(),
    );
    // vi.waitFor moves the fake clock on while the map mounts, so the first
    // frame has drifted each cloud east by a fraction of a pixel.
    onScreen(map).forEach((at, i) => {
      expect(at.x - SPOTS[i].rest * 400, `cloud ${i} x`).toBeGreaterThanOrEqual(
        0,
      );
      expect(at.x - SPOTS[i].rest * 400, `cloud ${i} x`).toBeLessThan(2);
      expect(at.y, `cloud ${i} y`).toBeCloseTo(spotY(map, i), 6);
    });
    for (const host of hosts()) {
      expect(host.style, "no screen-space transform or animation").toEqual({
        display: "block",
      });
    }
  });

  it("pan and zoom with the map: the camera moves no cloud on view beyond one drift step", async () => {
    const { map } = await clouds();
    const at = places();
    const before = onScreen(map);
    map.camera = { lng: OPEN.lng + 1, lat: OPEN.lat, zoom: OPEN.zoom };
    map.fire("move");
    expect(places(), "a pan alone moves no cloud").toEqual(at);
    const degPx = (512 * 2 ** OPEN.zoom) / 360;
    onScreen(map).forEach((p, i) =>
      expect(before[i].x - p.x, `cloud ${i}`).toBeCloseTo(degPx, 6),
    );
    expect(checkedFrame(map, "after a pan"), "all still on view").toBe(0);
    // Zooms and pans, small and large. A cloud the camera leaves on view only
    // drifts; one it throws far off the view may come back in, off the view.
    for (const camera of [
      { lng: OPEN.lng, lat: OPEN.lat, zoom: 5.5 },
      { lng: OPEN.lng, lat: OPEN.lat, zoom: 4 },
      { lng: OPEN.lng - 2, lat: OPEN.lat + 1, zoom: 4 },
      { lng: OPEN.lng, lat: OPEN.lat, zoom: 8 },
      { lng: OPEN.lng, lat: OPEN.lat, zoom: 3 },
    ]) {
      map.camera = camera;
      map.fire("zoom");
      map.fire("move");
      checkedFrame(map, `camera ${JSON.stringify(camera)}`);
    }
  });

  it("drift east at a steady screen speed at any width and zoom, crossing the view in 30 to 50 s", async () => {
    const { map } = await clouds();
    for (const width of [300, 390, 430, 1280, 1920]) {
      map.width = width;
      map.fire("resize");
      for (const zoom of [5, 8, 11, 3]) {
        const at = `${width} px at zoom ${zoom}`;
        map.camera = { ...map.camera!, zoom };
        map.fire("zoom");
        for (let t = 0; t < 5000; t += 200) frame();
        const before = onScreen(map);
        for (let t = 0; t < 1000; t += 200) frame();
        const perSec = onScreen(map).map((p, i) => p.x - before[i].x);
        const steady = perSec.filter((d) => d > 0);
        expect(
          steady.length,
          `${at}: clouds that did not wrap`,
        ).toBeGreaterThan(0);
        for (const d of steady) {
          expect(width / d, at).toBeGreaterThanOrEqual(30);
          expect(width / d, at).toBeLessThanOrEqual(50);
        }
        expect(new Set(perSec.map((d) => d.toFixed(3))).size, at).toBe(3);
      }
    }
  });

  it("read the map's size only at load and on resize, never per frame", async () => {
    const { map } = await clouds();
    const reads = vi.spyOn(map, "getContainer");
    for (let t = 0; t < 2000; t += 200) frame();
    expect(reads, "no layout read in the frame loop").not.toHaveBeenCalled();
    map.width = 300;
    for (let t = 0; t < 400; t += 200) frame();
    expect(reads).not.toHaveBeenCalled();
    map.fire("resize");
    // Read again on resize: once for the clouds, once for the pin pills.
    expect(reads).toHaveBeenCalledTimes(2);
    reads.mockClear();
    const before = onScreen(map);
    frame();
    expect(reads).not.toHaveBeenCalled();
    let checked = 0;
    onScreen(map).forEach((p, i) => {
      if (p.x > before[i].x) {
        checked++;
        expect(p.x - before[i].x, "speed for the new width").toBeCloseTo(
          (300 / CROSS_S[i]) * 0.2,
          6,
        );
      }
    });
    expect(checked, "clouds that drifted rather than wrapped").toBeGreaterThan(
      0,
    );
  });

  it("write a cloud's fade and size only when they change", async () => {
    const { map, imgs, hosts } = await clouds();
    frame();
    let writes = 0;
    for (const el of [...imgs, ...hosts()]) {
      el.style = new Proxy(el.style, {
        set(target, key, value) {
          writes++;
          return Reflect.set(target, key, value);
        },
      });
    }
    // All three sit well inside the view, so each frame's fade is still 1.
    for (let t = 0; t < 2000; t += 200) frame();
    expect(writes, "nothing changed").toBe(0);
    map.fire("zoom");
    expect(writes, "same zoom, same size and display").toBe(0);
    map.camera = { ...map.camera!, zoom: OPEN.zoom + 1 };
    map.fire("zoom");
    expect(writes, "a new size for each picture").toBe(3);
  });

  it("come back in only off the view, after a zoom out, a pan and a resize", async () => {
    const { map } = await clouds();
    let jumps = driftChecked(map, 60_000);
    expect(jumps, "each wrapped at least once").toBeGreaterThanOrEqual(3);
    map.camera = { ...map.camera!, zoom: 3 };
    map.fire("zoom");
    jumps = driftChecked(map, 60_000);
    expect(jumps, "zoomed out").toBeGreaterThan(0);
    map.camera = { ...map.camera!, lng: map.camera!.lng + 20 };
    map.fire("move");
    jumps = driftChecked(map, 60_000);
    expect(jumps, "panned").toBeGreaterThan(0);
    map.width = 250;
    map.height = 500;
    map.fire("resize");
    jumps = driftChecked(map, 60_000);
    expect(jumps, "resized").toBeGreaterThan(0);
    // After all that the clouds still cross the view.
    const seen = [false, false, false];
    for (let t = 0; t < 60_000; t += 200) {
      frame();
      onScreen(map).forEach((p, i) => (seen[i] ||= !offView(map, p)));
    }
    expect(seen).toEqual([true, true, true]);
  });

  it("bring clouds that are far off the view back in off its west edge, staggered", async () => {
    const { map } = await clouds();
    map.camera = { lng: OPEN.lng + 40, lat: OPEN.lat + 15, zoom: 8 };
    map.fire("move");
    map.fire("zoom");
    expect(
      onScreen(map).every((p) => offView(map, p)),
      "all lost",
    ).toBe(true);
    frame();
    const cw = 74 * cloudScale(8, OPEN.zoom);
    onScreen(map).forEach((p, i) => {
      expect(p.x, `cloud ${i}`).toBeCloseTo(
        -cw - [0, 0.5, 0.25][i] * map.width,
        6,
      );
      expect(p.y, `cloud ${i}`).toBeCloseTo(spotY(map, i), 6);
    });
    const seen = [false, false, false];
    for (let t = 0; t < 60_000; t += 200) {
      frame();
      onScreen(map).forEach((p, i) => (seen[i] ||= !offView(map, p)));
    }
    expect(seen, "each drifts into view").toEqual([true, true, true]);
  });

  it("keep a cloud near the view across the antimeridian", async () => {
    const { map } = await clouds(
      {},
      { camera: { lng: 179.9, lat: 0, zoom: 5 } },
    );
    const before = onScreen(map);
    // MapLibre reports the centre within -180..180, so a small pan east of
    // the antimeridian reads as a jump of almost 360 degrees.
    map.camera = { lng: -179.9, lat: 0, zoom: 5 };
    map.fire("move");
    frame();
    const pxPerDeg = (512 * 2 ** 5) / 360;
    onScreen(map).forEach((p, i) => {
      expect(p.x, `cloud ${i}`).toBeCloseTo(
        before[i].x - 0.2 * pxPerDeg + stepPx(map, i),
        6,
      );
      expect(Math.abs(cloudMarkers()[i].lngLat![0] - -179.9)).toBeLessThan(180);
    });
  });

  it("wait to be placed until the map shows them: a short route then a zoom out", async () => {
    const { map } = await clouds(
      {},
      { camera: { lng: -75, lat: 40, zoom: 14 } },
    );
    for (let t = 0; t < 2000; t += 200) frame();
    expect(cloudMarkers(), "none at street zoom").toHaveLength(0);
    map.camera = { lng: -75.1, lat: 40.1, zoom: 9 };
    map.fire("zoom");
    nextFrame();
    expect(cloudMarkers()).toHaveLength(3);
    onScreen(map).forEach((p, i) => {
      expect(p.x).toBeCloseTo(SPOTS[i].rest * 400, 6);
      expect(p.y).toBeCloseTo(spotY(map, i), 6);
    });
    expect(map.afterCanvas).toHaveLength(3);
  });

  it("wait to be placed until the map has a size", async () => {
    const { map } = await clouds({}, { camera: OPEN, width: 0, height: 0 });
    for (let t = 0; t < 2000; t += 200) frame();
    expect(cloudMarkers(), "none on a 0 x 0 map").toHaveLength(0);
    map.width = 400;
    map.height = 800;
    nextFrame();
    expect(
      cloudMarkers(),
      "none until MapLibre reports the resize",
    ).toHaveLength(0);
    map.fire("resize");
    nextFrame();
    expect(cloudMarkers()).toHaveLength(3);
    onScreen(map).forEach((p, i) => {
      expect(p.x).toBeCloseTo(SPOTS[i].rest * 400, 6);
      expect(p.y).toBeCloseTo(spotY(map, i), 6);
    });
  });

  it("live in the clear area between the header and the card", async () => {
    // A 400 x 800 map whose card (and credit row) covers all but 80..360.
    const { map } = await clouds({ bottomPadding: 400 });
    expect(area(map)).toEqual({ top: 80, bottom: 360 });
    onScreen(map).forEach((p, i) => {
      expect(p.y, `cloud ${i}`).toBeCloseTo(80 + SPOTS[i].top * 280, 6);
      expect(p.y).toBeGreaterThan(80);
      expect(p.y).toBeLessThan(360);
    });
  });

  it("bring back a cloud that is only below the clear area, inside it", async () => {
    const { map } = await clouds();
    // Pan north 200 px: cloud 2 (64% down the 80..500 area, y 349) lands at
    // y 549, still on the map but under the card; clouds 0 and 1 stay clear.
    const north = map.unproject([200, 200]);
    map.camera = { ...map.camera!, lat: north.lat };
    map.fire("move");
    const under = onScreen(map);
    expect(under[2].y).toBeGreaterThan(area(map).bottom + 36);
    expect(under[2].y).toBeLessThan(map.height);
    expect(under.slice(0, 2).every((p) => !offView(map, p))).toBe(true);
    frame();
    const back = onScreen(map);
    expect(back[2].x, "staggered off the west edge").toBeCloseTo(
      -74 - 0.25 * map.width,
      6,
    );
    expect(back[2].y, "back inside the clear area").toBeCloseTo(
      spotY(map, 2),
      6,
    );
    [0, 1].forEach((i) =>
      expect(back[i].x - under[i].x, `cloud ${i} only drifts`).toBeCloseTo(
        stepPx(map, i),
        6,
      ),
    );
  });

  it("follow the clear area when the card changes height", async () => {
    const { map } = await clouds(
      {},
      { camera: { lng: -75, lat: 40, zoom: 14 } },
    );
    // The card grows before the clouds are placed.
    pads = { top: 80, bottom: 400 };
    renderWithEffects(MapView, props({ bottomPadding: 400 }));
    expect(maps, "same map").toHaveLength(1);
    map.camera = { lng: -75, lat: 40, zoom: 9 };
    map.fire("zoom");
    nextFrame();
    expect(cloudMarkers()).toHaveLength(3);
    onScreen(map).forEach((p, i) =>
      expect(p.y, `placed cloud ${i}`).toBeCloseTo(80 + SPOTS[i].top * 280, 6),
    );
    // Then the card grows again, to 80..240: cloud 2 (y 259) is now under it.
    pads = { top: 80, bottom: 520 };
    renderWithEffects(MapView, props({ bottomPadding: 520 }));
    expect(area(map)).toEqual({ top: 80, bottom: 240 });
    const was = onScreen(map);
    expect(was[2].y).toBeGreaterThan(240);
    // A pan throws all three far off the view, so all three come back in:
    // 0 and 1 at their own heights, still clear, and 2 at its spot in the
    // new area.
    map.camera = { ...map.camera, lng: map.camera.lng + 30 };
    map.fire("move");
    frame();
    const back = onScreen(map);
    expect(back[0].y).toBeCloseTo(was[0].y, 6);
    expect(back[1].y).toBeCloseTo(was[1].y, 6);
    expect(back[2].y, "inside the new area").toBeCloseTo(
      80 + SPOTS[2].top * 160,
      6,
    );
    back.forEach((p, i) =>
      expect(p.x, `cloud ${i} off the west edge`).toBeLessThan(0),
    );
  });

  it("wait to be placed while the card leaves no clear area", async () => {
    const { map } = await clouds({ bottomPadding: 700 });
    for (let t = 0; t < 1000; t += 200) frame();
    expect(cloudMarkers(), "card and header cover the map").toHaveLength(0);
    pads = { top: 80, bottom: 260 };
    renderWithEffects(MapView, props({ bottomPadding: 260 }));
    nextFrame();
    expect(cloudMarkers()).toHaveLength(3);
    onScreen(map).forEach((p, i) => expect(p.y).toBeCloseTo(spotY(map, i), 6));
  });

  it("pause while the tab is hidden and resume without a jump", async () => {
    const { map } = await clouds();
    frame();
    const shown = places();
    fakeDocument.hidden = true;
    for (let t = 0; t < 5000; t += 200) frame();
    expect(places(), "still while hidden").toEqual(shown);
    fakeDocument.hidden = false;
    const before = onScreen(map);
    vi.setSystemTime(Date.now() + 60_000);
    nextFrame();
    onScreen(map).forEach((p, i) =>
      expect(p.x - before[i].x, "a quarter second of drift").toBeCloseTo(
        stepPx(map, i) * 1.25,
        6,
      ),
    );
  });

  it("stay put under reduced motion, still shown and anchored, and drift once it is off", async () => {
    const reduce = { matches: true };
    vi.stubGlobal("matchMedia", (q: string) =>
      q === "(prefers-reduced-motion: reduce)" ? reduce : { matches: false },
    );
    const { map, hosts } = await clouds();
    const still = places();
    for (let t = 0; t < 10_000; t += 200) frame();
    expect(places()).toEqual(still);
    for (const host of hosts()) expect(host.style.display).toBe("block");
    onScreen(map).forEach((p, i) =>
      expect(p.x).toBeCloseTo(SPOTS[i].rest * 400, 6),
    );
    map.camera = { ...map.camera!, lng: map.camera!.lng - 10 };
    map.fire("move");
    frame();
    expect(places(), "panned off the view, still anchored").toEqual(still);
    reduce.matches = false;
    map.camera = { ...map.camera!, lng: map.camera!.lng + 10 };
    map.fire("move");
    frame();
    places().forEach(([lng], i) => expect(lng).toBeGreaterThan(still[i][0]));
  });

  it("keep fading with the view under reduced motion, so a cloud that just came back in does not stay invisible", async () => {
    const reduce = { matches: false };
    vi.stubGlobal("matchMedia", (q: string) =>
      q === "(prefers-reduced-motion: reduce)" ? reduce : { matches: false },
    );
    const { map, imgs } = await clouds();
    let t = 0;
    while (imgs[1].style.opacity !== "0.000" && t < 60_000) {
      frame();
      t += 200;
    }
    expect(imgs[1].style.opacity, "came back in off the west edge").toBe(
      "0.000",
    );
    reduce.matches = true;
    const still = places();
    const degPx = (512 * 2 ** OPEN.zoom) / 360;
    map.camera = { ...map.camera!, lng: map.camera!.lng - 200 / degPx };
    map.fire("move");
    frame();
    expect(places(), "no drift").toEqual(still);
    expect(onScreen(map)[1].x).toBeGreaterThan(74);
    expect(imgs[1].style.opacity, "panned into view, shown").toBe("1.000");
  });

  it("show at zoom 11 and below, hide and hold still at street zoom, and grow gently from the zoom they were placed at", async () => {
    const { map, hosts, imgs } = await clouds();
    expect(imgs).toHaveLength(3);
    for (const [zoom, display, scale] of [
      [5, "block", "1.000"],
      [7, "block", "1.414"],
      [3, "block", "0.750"],
      [11, "block", "1.500"],
      [12, "none", "1.500"],
    ] as const) {
      map.camera = { ...map.camera!, zoom };
      map.fire("zoom");
      for (const host of hosts()) {
        expect(host.style.display, `zoom ${zoom}`).toBe(display);
      }
      for (const img of imgs) {
        expect(img.style.transform, `zoom ${zoom}`).toBe(`scale(${scale})`);
      }
    }
    const held = places();
    const setCalls = cloudMarkers().map((c) => vi.spyOn(c, "setLngLat"));
    for (let t = 0; t < 5000; t += 200) frame();
    expect(places(), "no drift while hidden at street zoom").toEqual(held);
    for (const spy of setCalls) expect(spy).not.toHaveBeenCalled();
    map.camera = { ...map.camera!, zoom: 11 };
    map.fire("zoom");
    frame();
    for (const spy of setCalls) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("fade the picture, not the marker, near the view's edges", async () => {
    const { map, imgs, hosts } = await clouds();
    frame();
    // Clouds placed 35%, 85% and 60% across, well inside the view.
    for (const img of imgs) expect(img.style.opacity).toBe("1.000");
    for (const host of hosts()) expect(host.style.opacity).toBeUndefined();
    map.camera = { ...map.camera!, lng: map.camera!.lng + 3 };
    map.fire("move");
    frame();
    const x = onScreen(map)[0].x;
    expect(imgs[0].style.opacity).toBe(cloudFade(x, 400, 74).toFixed(3));
  });

  it("scale with zoom within limits (cloudScale)", () => {
    expect(cloudScale(6, 6)).toBe(1);
    expect(cloudScale(8, 6)).toBeCloseTo(Math.SQRT2);
    expect(cloudScale(14, 6)).toBe(1.5);
    expect(cloudScale(2, 6)).toBe(0.75);
  });

  it("fade over one cloud width at each edge (cloudFade)", () => {
    expect(cloudFade(-74, 400, 74)).toBe(0);
    expect(cloudFade(-37, 400, 74)).toBe(0.5);
    expect(cloudFade(0, 400, 74)).toBe(1);
    expect(cloudFade(200, 400, 74)).toBe(1);
    expect(cloudFade(437, 400, 74)).toBe(0.5);
    expect(cloudFade(474, 400, 74)).toBe(0);
    expect(cloudFade(-200, 400, 74)).toBe(0);
  });

  it("never draw on preview maps", async () => {
    const { map } = await mounted(props({ preview: true }));
    for (let t = 0; t < 1000; t += 200) frame();
    expect(markers, "loft, sill and bird only").toHaveLength(3);
    expect(map.afterCanvas).toHaveLength(0);
  });

  it("leave the map with it", async () => {
    await clouds();
    const made = cloudMarkers();
    expect(made).toHaveLength(3);
    resetFakes();
    for (const c of made) expect(c.removed).toBe(true);
  });

  it("never take a tap and leave no screen-space overlay behind", () => {
    const css = readFileSync(
      new URL("./MapView.module.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(/\.cloud \{[^}]*pointer-events: none;/);
    expect(css).not.toMatch(/coo-map-cloud|\.clouds\b|\.lane\b/);
  });
});

describe("the illustrated day style (#950)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(midFlight());
    stubBrowser(vi);
  });

  afterEach(() => {
    resetFakes();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads /map/coo-day.style.json through loadMapStyle by day", async () => {
    const { map } = await mounted(props());
    expect(styleLoads).toEqual(["/map/coo-day.style.json"]);
    expect(map.options.style).toEqual(stubStyle("/map/coo-day.style.json"));
  });

  it("uses the same day style on a preview map", async () => {
    const { map } = await mounted(props({ preview: true }));
    expect(map.options.style).toEqual(stubStyle("/map/coo-day.style.json"));
  });

  const routeLeft = (map: FakeMap) =>
    (map.specs["route-left"] as { paint: Record<string, unknown> }).paint;

  it("paints the dotted route for the night style once it has loaded", async () => {
    const { map } = await mounted(props({ night: true }));
    map.fire("style.load");
    expect(routeLeft(map)["line-color"]).toBe("#FFF4DC");
  });

  it("paints the dotted route for the style that actually loaded", async () => {
    styleFailures.add("/map/coo-night.style.json");
    const { map } = await mounted(props({ night: true }));
    expect(map.options.style, "stock fallback").toBe(STOCK_STYLE);
    map.fire("style.load");
    expect(routeLeft(map)["line-color"], "ink on the light stock map").toBe(
      "#2A2140",
    );
  });

  it("keeps the current style when the night style will not load", async () => {
    const day = props();
    const { map } = await mounted(day);
    styleFailures.add("/map/coo-night.style.json");
    renderWithEffects(MapView, { ...day, night: true });
    await vi.waitFor(() =>
      expect(styleLoads).toContain("/map/coo-night.style.json"),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(map.styles, "no swap to stock or anything else").toEqual([]);
    map.fire("style.load");
    expect(routeLeft(map)["line-color"], "still day ink").toBe("#2A2140");
  });

  it("adds the route layers once the loaded style is in", async () => {
    const { map } = await mounted(props());
    expect(map.layers, "nothing before style.load").toEqual([]);
    map.fire("style.load");
    expect(map.layers).toEqual([
      "route-left",
      "route-flown-casing",
      "route-flown",
    ]);
  });
});

describe("the map credit (OSMF attribution guidelines)", () => {
  /** MapLibre's compact control once its text has arrived: open. */
  class Credit {
    classes = new Set([
      "maplibregl-ctrl-attrib",
      "maplibregl-compact",
      "maplibregl-compact-show",
    ]);
    open = true;
    classList = {
      contains: (c: string) => this.classes.has(c),
      remove: (c: string) => this.classes.delete(c),
    };
    removeAttribute(name: string) {
      if (name === "open") this.open = false;
    }
    get shown() {
      return this.open && this.classes.has("maplibregl-compact-show");
    }
  }

  async function withCredit(p: MapViewProps = props()) {
    const { map } = await mounted(p);
    const credit = new Credit();
    Object.assign(map.options.container as object, {
      querySelector: (sel: string) =>
        sel === ".maplibregl-ctrl-attrib.maplibregl-compact" ? credit : null,
    });
    return { map, credit };
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "Date",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    vi.setSystemTime(midFlight());
    stubBrowser(vi);
  });

  afterEach(() => {
    resetFakes();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps MapLibre's compact attribution with the tiles' own credit", async () => {
    const { map } = await mounted(props());
    expect(map.options.attributionControl).toEqual({ compact: true });
  });

  it("shows the full credit when the map draws, then folds it to (i) after 5 s", async () => {
    const { map, credit } = await withCredit();
    map.fire("load");
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS - 1);
    expect(credit.shown, "open for the first five seconds").toBe(true);
    vi.advanceTimersByTime(1);
    expect(credit.shown, "folded").toBe(false);
    expect(credit.classes.has("maplibregl-compact"), "(i) still there").toBe(
      true,
    );
  });

  it("folds on the first pan or zoom, before the five seconds are up", async () => {
    const { map, credit } = await withCredit();
    map.fire("load");
    map.fire("movestart", { originalEvent: {} });
    expect(credit.shown).toBe(false);
  });

  it("keeps the credit open on a preview map, which sits inside a link", async () => {
    const { map, credit } = await withCredit(props({ preview: true }));
    map.fire("load");
    map.fire("click");
    map.fire("data");
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS * 2);
    expect(credit.shown).toBe(true);
    expect(map.handlers.load ?? [], "no fold timer to start").toHaveLength(0);
    expect(map.handlers.data ?? [], "no fold listeners").toHaveLength(0);
  });

  it("keeps a tap on a preview's credit from the (i) toggle and the card's link", async () => {
    const { map } = await mounted(props({ preview: true }));
    const frame = map.options.container as FakeElement;
    const [guard] = frame.listeners;
    expect(guard).toMatchObject({ type: "click", capture: true });
    const tap = (target: object) => {
      const e = {
        target,
        stopped: false,
        prevented: false,
        stopPropagation() {
          this.stopped = true;
        },
        preventDefault() {
          this.prevented = true;
        },
      };
      guard.fn(e as unknown as Event);
      return { stopped: e.stopped, prevented: e.prevented };
    };
    const credit = { contains: (el: unknown) => el === osm };
    const osm = { closest: () => osm };
    const inCredit = (link: unknown) => ({
      closest: (sel: string) =>
        sel === ".maplibregl-ctrl-attrib" ? credit : link,
    });
    expect(tap(inCredit(null)), "text or (i)").toEqual({
      stopped: true,
      prevented: true,
    });
    expect(tap(inCredit({ card: true })), "only the card's link").toEqual({
      stopped: true,
      prevented: true,
    });
    expect(tap(inCredit(osm)), "the credit's own link still opens").toEqual({
      stopped: true,
      prevented: false,
    });
    expect(tap({ closest: () => null }), "the map itself").toEqual({
      stopped: false,
      prevented: false,
    });
    resetFakes();
    expect(frame.listeners, "removed when the map closes").toEqual([]);
  });

  it("folds even when load never fires, as on a busy tracker map", async () => {
    // Only the tiles' data arrives here, never load; the exact timing is
    // pinned in attribution.test.ts (waitFor in mounted() moves fake time).
    const { map, credit } = await withCredit();
    map.fire("sourcedata");
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS);
    expect(credit.shown).toBe(false);
  });

  it("folds five seconds after the style first draws", async () => {
    const { map, credit } = await withCredit();
    map.fire("styledata");
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS);
    expect(credit.shown).toBe(false);
  });

  it("stays folded through a night style swap and leaves (i) to reopen it", async () => {
    const day = props();
    const { map, credit } = await withCredit(day);
    map.fire("load");
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS);
    expect(map.handlers.data ?? [], "stopped listening").toHaveLength(0);
    renderWithEffects(MapView, { ...day, night: true });
    await vi.waitFor(() => expect(map.styles).toHaveLength(1));
    map.fire("style.load");
    map.fire("data");
    expect(credit.shown).toBe(false);
    credit.classes.add("maplibregl-compact-show");
    credit.open = true;
    map.fire("movestart", { originalEvent: {} });
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS);
    expect(credit.shown, "a reader's tap on (i) is left alone").toBe(true);
  });

  it("clears the timer when the map closes", async () => {
    const { map, credit } = await withCredit();
    map.fire("load");
    resetFakes();
    expect(map.removed).toBe(true);
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS * 2);
    expect(credit.shown).toBe(true);
    expect(vi.getTimerCount(), "no timers left behind").toBe(0);
  });

  it("lifts the map controls above the bottom card", () => {
    const html = renderToStaticMarkup(<MapView {...props()} />);
    expect(html).toMatch(/^(<link[^>]*>)*<div class="[^"]*frame[^"]*"/);
    expect(html, "by the card height it is given").toContain(
      "--coo-map-bottom:0px",
    );
    expect(
      renderToStaticMarkup(<MapView {...props({ controlsBottom: 260 })} />),
    ).toContain("--coo-map-bottom:260px");
    const css = readFileSync(
      join(process.cwd(), "src/components/MapView.module.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.frame :global\(\.maplibregl-ctrl-bottom-right\)[^{]*\{\s*bottom: var\(--coo-map-bottom/,
    );
    expect(css).toContain("background: var(--coo-card)");
    expect(css).toContain("border: var(--coo-line-thin)");
  });
});
