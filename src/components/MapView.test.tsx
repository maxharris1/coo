import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpolate, type FlightPlan, type LatLon } from "@/lib/flight/engine";
import {
  FakeMap,
  find,
  maps,
  markers,
  nextFrame,
  renderWithEffects,
  resetFakes,
  stubBrowser,
} from "@/test/fakeMapLibre";
import { Bird } from "./Bird";
import {
  FAR_ZOOM,
  MapView,
  dotsStart,
  ZOOM_BANDS,
  headsWest,
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
    expect(map.options.fitBoundsOptions).toEqual({
      padding: { top: 16, left: 16, right: 16, bottom: 16 },
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

  it("is hidden from assistive tech with no pin labels and no Find button", () => {
    const html = renderToStaticMarkup(
      <MapView {...props({ preview: true })} />,
    );
    expect(html).toMatch(/^(<link[^>]*>)*<div aria-hidden="true"/);
    expect(html).not.toContain("Your loft");
    expect(html).not.toContain(">Philly<");
    expect(html).not.toContain("Find");
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
    expect(map.options.fitBoundsOptions).toEqual({
      padding: { top: 80, left: 48, right: 48, bottom: 260 },
    });
    expect(map.handlers.dragstart).toHaveLength(1);
    expect(map.handlers.zoomstart).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(map.eased, "follows a bird near the edge").toBe(1);
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
