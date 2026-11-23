import type { MapOptions } from "maplibre-gl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { positionAt } from "@/lib/flight/engine";
import { MapView, type MapViewProps } from "./MapView";

const lib = vi.hoisted(() => {
  const maps: FakeMap[] = [];
  const calls: string[] = [];
  const liveMarkers = new Set<FakeMarker>();
  const markerAt: [number, number][] = [];
  let effect: (() => (() => void) | void) | undefined;
  let deps: unknown[] | undefined;

  class FakeMap {
    removed = false;
    keyboardRotation = true;
    keyboard = {
      disableRotation: () => {
        this.keyboardRotation = false;
      },
    };
    touchZoomRotate = { disableRotation() {} };
    constructor(readonly options: Record<string, unknown>) {
      calls.push("new Map");
      maps.push(this);
    }
    on() {
      return this;
    }
    remove() {
      this.removed = true;
    }
  }

  class FakeMarker {
    setLngLat(at: [number, number]) {
      markerAt.push(at);
      return this;
    }
    addTo() {
      liveMarkers.add(this);
      return this;
    }
    remove() {
      liveMarkers.delete(this);
      return this;
    }
  }

  class FakeBounds {
    extend() {
      return this;
    }
  }

  return {
    maps,
    calls,
    setWorkerUrl: (url: string) => {
      calls.push(`setWorkerUrl ${url}`);
    },
    liveMarkers,
    markerAt,
    FakeMap,
    FakeMarker,
    FakeBounds,
    setEffect: (fn: typeof effect, d?: unknown[]) => {
      effect = fn;
      deps = d;
    },
    runEffect: () => effect!(),
    deps: () => deps,
  };
});

vi.mock("maplibre-gl", () => ({
  Map: lib.FakeMap,
  Marker: lib.FakeMarker,
  LngLatBounds: lib.FakeBounds,
  setWorkerUrl: lib.setWorkerUrl,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: <T>(initial: T) => ({ current: initial ?? ({} as T) }),
  useState: <T>(initial: T) => [initial, () => {}],
  useEffect: lib.setEffect,
}));

const props = {
  flightId: "f1",
  from: { lat: 40, lon: -74, label: "Loft" },
  to: { lat: 41, lon: -73, label: "Sill" },
  plan: {
    distanceMi: 100,
    bearingDeg: 30,
    onTimeOdds: 0.9,
    delayed: false,
    delayKind: "none",
    arriveAtMs: 0,
    segments: [],
    events: [],
  },
  distanceMi: 100,
  bird: { id: "b1", name: "Pip", look: "city", gear: [] },
  offsetMs: 0,
  bottomPadding: 150,
  night: false,
  loftLabel: "Your loft",
  sillLabel: "Priya, Philly",
} satisfies MapViewProps;

function routeStart(): [number, number] {
  const p = positionAt(props.plan, props.from, props.to, Date.now());
  return [p.lon, p.lat];
}

async function mountMap(over: Partial<MapViewProps> = {}) {
  MapView({ ...props, ...over });
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.maps.at(-1)?.removed).toBe(false));
  return { map: lib.maps.at(-1)!, cleanup };
}

beforeEach(() => {
  lib.maps.length = 0;
  lib.calls.length = 0;
  lib.liveMarkers.clear();
  lib.markerAt.length = 0;
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("removes every marker it added when the effect cleans up", async () => {
  for (let cycle = 0; cycle < 3; cycle++) {
    const { map, cleanup } = await mountMap();
    expect(lib.liveMarkers.size, "loft, sill and bird on the map").toBe(3);
    cleanup();
    expect(map.removed, "map removed").toBe(true);
    expect(lib.liveMarkers.size, "markers left after cleanup").toBe(0);
  }
});

it("turns off every input that could tilt the camera", async () => {
  const { map, cleanup } = await mountMap();
  const options = map.options as MapOptions;
  expect(options.maxPitch, "pitch is capped at flat").toBe(0);
  expect(options.touchPitch, "two-finger vertical drag").toBe(false);
  expect(options.dragRotate, "right-drag and ctrl-drag").toBe(false);
  expect(map.keyboardRotation, "shift plus arrow keys").toBe(false);
  cleanup();
});

it("points MapLibre at its bundled worker before creating the map", async () => {
  const { cleanup } = await mountMap();
  expect(lib.calls).toEqual([
    expect.stringMatching(/^setWorkerUrl .*maplibre-gl-worker\.mjs$/),
    "new Map",
  ]);
  cleanup();
});

it("shows the licence once, from the tiles, with no custom attribution", async () => {
  const { map, cleanup } = await mountMap();
  expect(map.options.attributionControl).toEqual({ compact: true });
  cleanup();
});

it("plants the loft at the origin and the sill at the destination by default", async () => {
  const { cleanup } = await mountMap();
  const [loft, sill, bird] = lib.markerAt;
  expect(loft, "loft pin").toEqual([-74, 40]);
  expect(sill, "sill pin").toEqual([-73, 41]);
  expect(bird, "bird on the from-to route").toEqual(routeStart());
  cleanup();
});

it("plants the loft at the destination on a trip home, with the route unchanged", async () => {
  const { cleanup } = await mountMap({ loftAt: "to" });
  const [loft, sill, bird] = lib.markerAt;
  expect(loft, "loft pin").toEqual([-73, 41]);
  expect(sill, "sill pin").toEqual([-74, 40]);
  expect(bird, "bird still on the from-to route").toEqual(routeStart());
  cleanup();
});

it("keeps the map mounted when only the pin labels change", () => {
  MapView(props);
  const before = lib.deps();
  MapView({ ...props, loftLabel: "Max, Tudor City", sillLabel: "Your sill" });
  expect(lib.deps()).toEqual(before);
});
