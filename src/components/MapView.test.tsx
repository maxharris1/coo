import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FlightPlan, LatLon } from "@/lib/flight/engine";
import {
  FAR_ZOOM,
  MapView,
  ZOOM_BANDS,
  headsWest,
  routeFractions,
  zoomForDistance,
  type BirdState,
} from "./MapView";

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
