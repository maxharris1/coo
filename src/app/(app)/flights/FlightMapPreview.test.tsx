import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bird } from "@/components/Bird";
import { MapView, type MapViewProps } from "@/components/MapView";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import { jobLegs } from "@/lib/game/jobDest";
import type { Flight } from "@/server/services/flights/shape";
import type { JobView } from "@/server/services/jobs/get";
import {
  find,
  maps,
  markers,
  nextFrame,
  renderWithEffects,
  resetFakes,
  stubBrowser,
} from "@/test/fakeMapLibre";
import { jobView } from "../jobs/[id]/JobTracker";
import { FlightMapPreview, JobMapPreview } from "./FlightMapPreview";
import { earlierRows, type RowState } from "./flightsViewModel";

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

const vector: { input: FlightInput; plan: FlightPlan } = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors.find((v: { name: string }) => v.name === "block");

function flight(over: Partial<Flight> = {}): Flight {
  return {
    id: "f1",
    kind: "delivery",
    status: "flying",
    bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
    owner: { id: "u1", name: "Max", handle: "max" },
    counterpart: { id: "u2", name: "Priya", handle: "priya" },
    from: { ...vector.input.from, label: "Brooklyn" },
    to: { ...vector.input.to, label: "Philly" },
    releaseAt: vector.plan.segments[0].startMs,
    arriveAt: vector.plan.arriveAtMs,
    distanceMi: vector.plan.distanceMi,
    plan: vector.plan,
    placeNames: {},
    role: "mine",
    hasNote: true,
    ...over,
  };
}

function mapProps(tree: ReturnType<typeof FlightMapPreview>): MapViewProps {
  const map = find(tree, MapView);
  if (!map) throw new Error("the preview rendered no MapView");
  return map.props as MapViewProps;
}

function pose(p: MapViewProps): string {
  const drawn = renderWithEffects(MapView, p);
  const bird = find(drawn, Bird);
  if (!bird) throw new Error("MapView rendered no bird");
  return (bird.props as { pose: string }).pose;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(vector.plan.segments[0].startMs + 60_000);
  stubBrowser(vi);
});

afterEach(() => {
  resetFakes();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("FlightMapPreview (#901 ac-2)", () => {
  it("passes the served points and plan through unchanged as a preview", () => {
    const f = flight();
    const p = mapProps(
      FlightMapPreview({
        flight: f,
        state: "flying",
        nowMs: Date.now(),
        offsetMs: 0,
      }),
    );
    expect(p.preview).toBe(true);
    expect(p.from).toBe(f.from);
    expect(p.to).toBe(f.to);
    expect(p.plan).toBe(f.plan);
    expect(p.flightId).toBe(f.id);
    expect(p.bird).toBe(f.bird);
  });

  it.each<[RowState, string]>([
    ["scheduled", "perched"],
    ["flying", "fly"],
    ["almostHere", "fly"],
    ["roosting", "sleep"],
    ["delayed", "surprise"],
    ["landed", "landed"],
  ])("draws a %s row in the %s pose", (state, expected) => {
    const p = mapProps(
      FlightMapPreview({
        flight: flight(),
        state,
        nowMs: Date.now(),
        offsetMs: 0,
      }),
    );
    expect(pose(p)).toBe(expected);
  });

  it("perches a bird with no plan yet on the origin", async () => {
    const f = flight({ status: "scheduled", plan: undefined });
    const p = mapProps(
      FlightMapPreview({
        flight: f,
        state: "scheduled",
        nowMs: Date.now(),
        offsetMs: 0,
      }),
    );
    expect(p.plan).toBeNull();
    expect(pose(p)).toBe("perched");
    await vi.waitFor(() => expect(maps).toHaveLength(1));
    nextFrame();
    expect(markers[2].lngLat).toEqual([f.from.lon, f.from.lat]);
  });

  it("perches a cancelled flight with no plan on the origin in the earlier list", async () => {
    const nowMs = Date.parse("2026-11-22T03:00:00.000Z");
    vi.setSystemTime(nowMs);
    const f = flight({
      status: "cancelled",
      plan: undefined,
      from: { lat: 35.68, lon: 139.69, label: "Tokyo" },
      to: { lat: 40.73, lon: -73.99, label: "New York" },
    });
    const [row] = earlierRows([f], nowMs, "America/New_York", "mi");
    const p = mapProps(
      FlightMapPreview({
        flight: row.flight,
        state: row.state,
        nowMs,
        offsetMs: 0,
      }),
    );
    expect(p.plan).toBeNull();
    expect(p.night, "shaded by the origin's noon").toBe(false);
    expect(pose(p)).toBe("perched");
    await vi.waitFor(() => expect(maps).toHaveLength(1));
    nextFrame();
    expect(markers[2].lngLat).toEqual([f.from.lon, f.from.lat]);
  });

  it("puts the loft pin at home on a return flight", () => {
    const p = mapProps(
      FlightMapPreview({
        flight: flight({ kind: "return" }),
        state: "flying",
        nowMs: Date.now(),
        offsetMs: 0,
      }),
    );
    expect(p.loftAt).toBe("to");
  });
});

describe("JobMapPreview (#901 ac-2)", () => {
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

  it("passes the jobView legs through unchanged as a flying preview", () => {
    const now = Date.parse("2026-11-22T15:03:00.000Z");
    const legs = jobLegs(
      job.map!.loft,
      job.map!.dest,
      Date.parse(job.startedAt),
      Date.parse(job.endsAt),
    );
    const view = jobView(job, legs, now, "America/New_York");
    if (view.state === "home" || !view.map) throw new Error("no job map");
    const p = mapProps(
      JobMapPreview({ map: view.map, bird: job.bird, offsetMs: 0 }),
    );
    expect(p).toMatchObject({ ...view.map, preview: true, bird: job.bird });
    expect(p.from).toBe(view.map.from);
    expect(p.to).toBe(view.map.to);
    expect(p.plan).toBe(view.map.plan);
    expect(pose(p)).toBe("fly");
  });
});
