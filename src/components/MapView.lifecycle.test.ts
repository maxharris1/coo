import type { MapOptions } from "maplibre-gl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MapView, type MapViewProps } from "./MapView";

const lib = vi.hoisted(() => {
  const maps: FakeMap[] = [];
  const calls: string[] = [];
  const liveMarkers = new Set<FakeMarker>();
  let effect: (() => (() => void) | void) | undefined;

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
    setLngLat() {
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
    FakeMap,
    FakeMarker,
    FakeBounds,
    setEffect: (fn: typeof effect) => {
      effect = fn;
    },
    runEffect: () => effect!(),
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

const props: MapViewProps = {
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
};

async function mountMap() {
  MapView(props);
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.maps.at(-1)?.removed).toBe(false));
  return { map: lib.maps.at(-1)!, cleanup };
}

beforeEach(() => {
  lib.maps.length = 0;
  lib.calls.length = 0;
  lib.liveMarkers.clear();
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
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
