import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoostMap } from "./RoostMap";

const lib = vi.hoisted(() => {
  const calls: string[] = [];
  const maps: FakeMap[] = [];
  let effect: (() => (() => void) | void) | undefined;

  class FakeMap {
    removed = false;
    resizes = 0;
    constructor(readonly options: Record<string, unknown>) {
      calls.push("new Map");
      maps.push(this);
    }
    resize() {
      this.resizes += 1;
    }
    remove() {
      this.removed = true;
    }
  }

  const observers = new Set<FakeObserver>();
  class FakeObserver {
    constructor(readonly fire: () => void) {
      observers.add(this);
    }
    observe() {}
    disconnect() {
      observers.delete(this);
    }
  }

  class FakeMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
  }

  return {
    calls,
    maps,
    FakeMap,
    FakeMarker,
    FakeObserver,
    observers,
    setWorkerUrl: (url: string) => {
      calls.push(`setWorkerUrl ${url}`);
    },
    setEffect: (fn: typeof effect) => {
      effect = fn;
    },
    runEffect: () => effect!(),
  };
});

vi.mock("maplibre-gl", () => ({
  Map: lib.FakeMap,
  Marker: lib.FakeMarker,
  setWorkerUrl: lib.setWorkerUrl,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: <T>(initial: T) => ({ current: initial ?? ({} as T) }),
  useEffect: lib.setEffect,
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", lib.FakeObserver);
});

afterEach(() => {
  lib.calls.length = 0;
  lib.maps.length = 0;
  lib.observers.clear();
  vi.unstubAllGlobals();
});

const roost = {
  lat: 40.749,
  lon: -73.972,
  label: "Tudor City",
  city: "New York, NY",
};

it("resizes the map when its 0x0 container later gets a 16/10 box", async () => {
  RoostMap({ roost });
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.maps).toHaveLength(1));
  const canvas = lib.maps[0].options.container as Record<string, number>;
  Object.assign(canvas, { clientWidth: 0, clientHeight: 0 });
  for (const o of lib.observers) o.fire();
  expect(lib.maps[0].resizes, "still 0x0").toBe(0);

  Object.assign(canvas, { clientWidth: 320, clientHeight: 200 });
  for (const o of lib.observers) o.fire();
  expect(lib.maps[0].resizes, "resized for the 320x200 box").toBe(1);

  cleanup();
  expect(lib.observers.size, "observer gone after unmount").toBe(0);
});

it("shows the licence once, from the tiles, with no custom attribution", async () => {
  RoostMap({ roost });
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.maps).toHaveLength(1));
  expect(lib.maps[0].options.attributionControl).toEqual({ compact: true });
  cleanup();
});

it("points MapLibre at its bundled worker before creating the map", async () => {
  RoostMap({
    roost: { lat: 40.7, lon: -74, label: "Brooklyn", city: "New York" },
  });
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.maps).toHaveLength(1));
  expect(lib.calls).toEqual([
    expect.stringMatching(/^setWorkerUrl .*maplibre-gl-worker\.mjs$/),
    "new Map",
  ]);
  cleanup();
  expect(lib.maps[0].removed, "map removed on unmount").toBe(true);
});
