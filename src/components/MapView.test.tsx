import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightPlan, LatLon } from "@/lib/flight/engine";
import {
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

describe("pin labels stay inside the map (#924 ac-1)", () => {
  const PAD = 16;
  const PILL_CHROME = 2 * 8 + 2 * 2;
  const MEASURED = {
    "Enrico Palazzo, Tudor City": 147.6,
    "Bartholomew Featherstonehaugh, Upper East Side": 289.5,
    "Your sill": 46.1,
    "Your loft": 49,
  };
  const pill = (label: keyof typeof MEASURED, mapWidth: number) =>
    Math.min(MEASURED[label] + PILL_CHROME, mapWidth - 2 * PAD);
  const box = (pinX: number, labelWidth: number, mapWidth: number) => {
    const shift = pinLabelShift({ pinX, labelWidth, mapWidth, pad: PAD });
    return {
      left: pinX - labelWidth / 2 + shift,
      right: pinX + labelWidth / 2 + shift,
    };
  };

  describe.each([390, 320])("on a %ipx tracker", (mapWidth) => {
    it.each([
      "Enrico Palazzo, Tudor City",
      "Bartholomew Featherstonehaugh, Upper East Side",
    ] as const)("keeps the %s pill whole by the right edge", (label) => {
      const { left, right } = box(
        mapWidth - 10,
        pill(label, mapWidth),
        mapWidth,
      );
      expect(left).toBeGreaterThanOrEqual(PAD);
      expect(right).toBeLessThanOrEqual(mapWidth - PAD);
    });

    it.each(["Your sill", "Your loft"] as const)(
      "keeps the %s pill whole by the left edge",
      (label) => {
        const { left, right } = box(4, pill(label, mapWidth), mapWidth);
        expect(left).toBeGreaterThanOrEqual(PAD);
        expect(right).toBeLessThanOrEqual(mapWidth - PAD);
      },
    );
  });

  it("leaves a pill centred on a pin away from the edges", () => {
    expect(
      pinLabelShift({ pinX: 195, labelWidth: 168, mapWidth: 390, pad: PAD }),
    ).toBe(0);
  });

  it("caps the pill at the map width less the padding and ellipsizes the text", () => {
    const html = renderToStaticMarkup(
      <MapView
        {...props({
          sillLabel: "Bartholomew Featherstonehaugh, Upper East Side",
        })}
      />,
    );
    const span = html.match(
      /<span style="[^"]*">Bartholomew[^<]*<\/span>/,
    )?.[0];
    expect(span).toContain("overflow:hidden");
    expect(span).toContain("text-overflow:ellipsis");
    expect(span).toContain("white-space:nowrap");
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
      "re-clamps both labels on %s",
      async (event) => {
        const { tree, map } = await mounted(props());
        const spans = labelsIn(tree);
        expect(spans).toHaveLength(2);
        for (const s of spans) s.offsetWidth = 168;
        map.point = { x: 395, y: 0 };
        map.fire(event);
        for (const s of spans) {
          expect(s.style.maxWidth).toBe("368px");
          expect(s.style.transform).toBe("translateX(calc(-50% + -95px))");
        }
      },
    );

    describe.each([390, 320])(
      "panned into the next world copy at zoom 3 on a %ipx tracker",
      (mapWidth) => {
        it.each([
          "Enrico Palazzo, Tudor City",
          "Bartholomew Featherstonehaugh, Upper East Side",
        ] as const)(
          "keeps the %s pill and the loft pill whole",
          async (label) => {
            const p = props({ sillLabel: label });
            const { tree, map } = await mounted(p);
            const [loftLabel, sillLabel] = labelsIn(tree);
            loftLabel.offsetWidth = pill("Your loft", mapWidth);
            sillLabel.offsetWidth = pill(label, mapWidth);
            const [loftPin, sillPin] = [markers[0], markers[1]];
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
            for (const [pin, el] of [
              [loftPin, loftLabel],
              [sillPin, sillLabel],
            ] as const) {
              const x = map.project([pin.getLngLat().lng, 0]).x;
              const shift = Number(
                el.style.transform.match(/calc\(-50% \+ (-?[\d.]+)px\)/)?.[1],
              );
              expect(x - el.offsetWidth / 2 + shift).toBeGreaterThanOrEqual(
                PAD,
              );
              expect(x + el.offsetWidth / 2 + shift).toBeLessThanOrEqual(
                mapWidth - PAD,
              );
            }
            expect(map.project([sillPin.getLngLat().lng, 0]).x).toBeCloseTo(
              pinX,
            );
          },
        );
      },
    );
  });
});
