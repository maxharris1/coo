import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { Flight } from "@/server/services/flights/shape";
import { STOCK_STYLE } from "./mapStyle";
import { stubStyle, styleFailures, styleLoads } from "@/test/fakeMapLibre";
import { Bird } from "./Bird";
import { MapView } from "./MapView";
import { Tracker } from "./Tracker";

beforeEach(() => {
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  });
});

const NIGHT_STYLE = "/map/coo-night.style.json";
const DAY_STYLE = "/map/coo-day.style.json";

const lib = vi.hoisted(() => {
  type Effect = { deps?: unknown[]; cleanup?: (() => void) | void };
  const hooks = {
    refs: [] as { current: unknown }[],
    effects: [] as Effect[],
    pending: [] as (() => void)[],
    ref: 0,
    effect: 0,
  };

  class FakeMap {
    removed = false;
    styles: { style: unknown; options: unknown }[] = [];
    handlers: Record<string, ((e: object) => void)[]> = {};
    layers: string[] = [];
    keyboard = { disableRotation() {} };
    touchZoomRotate = { disableRotation() {} };
    constructor(readonly options: Record<string, unknown>) {
      maps.push(this);
    }
    on(event: string, fn: (e: object) => void) {
      (this.handlers[event] ??= []).push(fn);
      return this;
    }
    off() {
      return this;
    }
    fire(event: string) {
      for (const fn of this.handlers[event] ?? []) fn({});
    }
    setStyle(style: unknown, options: unknown) {
      this.styles.push({ style, options });
      this.layers = [];
      return this;
    }
    addSource() {
      return this;
    }
    addLayer(layer: { id: string }) {
      this.layers.push(layer.id);
      return this;
    }
    getSource() {
      return undefined;
    }
    project() {
      return { x: 0, y: 0 };
    }
    getZoom() {
      return 0;
    }
    getCanvas() {
      return { after() {} };
    }
    getContainer() {
      return { clientWidth: 390, clientHeight: 800 };
    }
    unproject([x, y]: [number, number]) {
      return { lng: -74 + x / 1000, lat: 41 - y / 1000 };
    }
    remove() {
      this.removed = true;
    }
  }
  const maps: FakeMap[] = [];
  const markers: FakeMarker[] = [];

  class FakeMarker {
    lngLat: [number, number] | undefined;
    constructor() {
      markers.push(this);
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      return this;
    }
  }

  class FakeBounds {
    extend() {
      return this;
    }
  }

  return { hooks, maps, markers, FakeMap, FakeMarker, FakeBounds };
});

vi.mock("maplibre-gl", () => ({
  Map: lib.FakeMap,
  Marker: lib.FakeMarker,
  LngLatBounds: lib.FakeBounds,
  setWorkerUrl: () => {},
}));

vi.mock("@/components/mapStyle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/mapStyle")>()),
  ...(await import("@/test/fakeMapLibre")).fakeMapStyle,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: <T,>(initial: T) =>
    (lib.hooks.refs[lib.hooks.ref++] ??= {
      current: initial ?? { style: {} },
    }) as { current: T },
  useState: <T,>(initial: T | (() => T)) => [
    typeof initial === "function" ? (initial as () => T)() : initial,
    () => {},
  ],
  useEffect: (fn: () => (() => void) | void, deps?: unknown[]) => {
    const k = lib.hooks.effect++;
    const prev = lib.hooks.effects[k];
    const changed =
      !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps?.[i]));
    if (!changed) return;
    lib.hooks.pending.push(() => {
      if (prev?.cleanup) prev.cleanup();
      lib.hooks.effects[k] = { deps, cleanup: fn() };
    });
  },
}));

type Vector = { name: string; input: FlightInput; plan: FlightPlan };

const vectors: Vector[] = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors;

function chicago(): Flight {
  return fromVector("chicago-overnight", "Chicago");
}

function fromVector(name: string, toLabel: string): Flight {
  const v = vectors.find((x) => x.name === name)!;
  return {
    id: v.input.flightId,
    kind: "delivery",
    status: "flying",
    bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
    owner: { id: "u1", name: "Max", handle: "max" },
    counterpart: { id: "u2", name: "Priya", handle: "priya" },
    from: { ...v.input.from, label: "Brooklyn" },
    to: { ...v.input.to, label: toLabel },
    releaseAt: v.plan.segments[0].startMs,
    arriveAt: v.plan.arriveAtMs,
    distanceMi: v.plan.distanceMi,
    plan: v.plan,
    input: v.input,
    placeNames: {},
    role: "mine",
    hasNote: true,
  };
}

function find(node: ReactNode, type: unknown): ReactElement | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type);
      if (found) return found;
    }
    return undefined;
  }
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (el.type === type) return el;
  return find(el.props?.children, type);
}

function words(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return `${node} `;
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(words).join("");
  return words(
    (node as ReactElement<{ children?: ReactNode }>).props?.children,
  );
}

function renderTracker(flight: Flight) {
  lib.hooks.ref = 0;
  lib.hooks.effect = 0;
  lib.hooks.pending = [];
  const tree = Tracker({
    flight,
    offsetMs: 0,
    timeZone: "America/New_York",
    units: "mi",
  });
  const map = find(tree, MapView);
  if (!map) throw new Error("Tracker rendered no MapView");
  const drawn = MapView(map.props as Parameters<typeof MapView>[0]);
  for (const run of lib.hooks.pending) run();
  const bird = find(drawn, Bird);
  if (!bird) throw new Error("MapView rendered no bird");
  return {
    page: words(tree),
    pose: (bird.props as { pose: string }).pose,
  };
}

async function mapCreated() {
  await vi.waitFor(() => expect(lib.maps.length).toBe(1));
  return lib.maps[0];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  lib.hooks.refs = [];
  lib.hooks.effects = [];
  lib.maps.length = 0;
  lib.markers.length = 0;
  styleLoads.length = 0;
  styleFailures.clear();
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  for (const e of lib.hooks.effects) if (e?.cleanup) e.cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the tracker map on the Chicago vector (ac-2)", () => {
  it("requests the night style when opened at 2 am", async () => {
    vi.setSystemTime(Date.parse("2026-11-20T02:00:00-05:00"));
    renderTracker(chicago());
    const map = await mapCreated();
    expect(styleLoads, "loaded through loadMapStyle").toEqual([NIGHT_STYLE]);
    expect(map.options.style, "initial style at 2 am").toEqual(
      stubStyle(NIGHT_STYLE),
    );
  });

  it("switches to the night style when the sun sets on an open map", async () => {
    const flight = chicago();
    vi.setSystemTime(Date.parse("2026-11-19T12:00:00-05:00"));
    renderTracker(flight);
    const map = await mapCreated();
    expect(map.options.style, "initial style at noon").toEqual(
      stubStyle(DAY_STYLE),
    );
    expect(map.styles, "no style change while it stays light").toEqual([]);

    vi.setSystemTime(Date.parse("2026-11-20T02:00:00-05:00"));
    renderTracker(flight);
    await vi.waitFor(() => expect(map.styles).toHaveLength(1));
    expect(styleLoads, "both loaded through loadMapStyle").toEqual([
      DAY_STYLE,
      NIGHT_STYLE,
    ]);
    expect(map.styles, "style swap at 2 am").toEqual([
      { style: stubStyle(NIGHT_STYLE), options: { diff: false } },
    ]);
    expect(lib.maps.length, "the same map is restyled, not rebuilt").toBe(1);

    map.fire("style.load");
    expect(map.layers, "route redrawn on the night style").toEqual([
      "route-left",
      "route-flown-casing",
      "route-flown",
    ]);
  });

  it("drops a night style that arrives after the sun is back up", async () => {
    const flight = chicago();
    vi.setSystemTime(Date.parse("2026-11-19T12:00:00-05:00"));
    renderTracker(flight);
    const map = await mapCreated();
    vi.setSystemTime(Date.parse("2026-11-20T02:00:00-05:00"));
    renderTracker(flight);
    vi.setSystemTime(Date.parse("2026-11-20T12:00:00-05:00"));
    renderTracker(flight);
    expect(styleLoads, "day is already on the map").toEqual([
      DAY_STYLE,
      NIGHT_STYLE,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(map.styles, "night dropped, day not set again").toEqual([]);
  });

  it("falls back to the stock style when ours will not load", async () => {
    styleFailures.add(DAY_STYLE);
    vi.setSystemTime(Date.parse("2026-11-19T12:00:00-05:00"));
    renderTracker(chicago());
    const map = await mapCreated();
    expect(map.options.style).toBe(STOCK_STYLE);
    map.fire("style.load");
    expect(map.layers, "route still drawn").toEqual([
      "route-left",
      "route-flown-casing",
      "route-flown",
    ]);
  });
});

describe("the tracker map as a short hop lands (#846 ac-2)", () => {
  let frames: FrameRequestCallback[] = [];
  const nextFrame = () => frames.at(-1)!(0);
  const birdAt = () => lib.markers[2].lngLat;

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
  });

  it("perches the bird on the loft before release", async () => {
    const flight = fromVector("block", "Philly");
    vi.setSystemTime(flight.releaseAt - 60_000);
    const view = renderTracker({ ...flight, status: "scheduled" });
    await mapCreated();
    nextFrame();
    expect(view.page).toContain("Scheduled");
    expect(view.pose).toBe("perched");
    expect(birdAt()).toEqual([flight.from.lon, flight.from.lat]);
  });

  it("flips the chip and the pose together and keeps the same map", async () => {
    const flight = fromVector("block", "Philly");
    vi.setSystemTime(flight.arriveAt! - 1000);
    const before = renderTracker(flight);
    const map = await mapCreated();
    expect(before.page).toContain("In the air");
    expect(before.pose).toBe("fly");

    vi.setSystemTime(flight.arriveAt! + 1000);
    const after = renderTracker(flight);
    nextFrame();
    expect(after.page).toContain("Landed");
    expect(after.pose).toBe("landed");
    expect(birdAt(), "bird on the sill").toEqual([
      flight.to.lon,
      flight.to.lat,
    ]);
    expect(lib.maps.length, "the same map, not rebuilt").toBe(1);
    expect(map.removed, "the map is still open").toBe(false);
  });

  it("puts a landed bird on the sill before the local clock catches up", async () => {
    const flight = fromVector("block", "Philly");
    vi.setSystemTime(flight.arriveAt! - 30_000);
    const view = renderTracker({ ...flight, status: "landed" });
    await mapCreated();
    nextFrame();
    expect(view.page).toContain("Landed");
    expect(view.pose).toBe("landed");
    expect(birdAt()).toEqual([flight.to.lon, flight.to.lat]);
  });
});
