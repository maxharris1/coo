import { afterEach, expect, it, vi } from "vitest";
import { RoostMap } from "./RoostMap";

const lib = vi.hoisted(() => {
  const calls: string[] = [];
  const maps: FakeMap[] = [];
  let effect: (() => (() => void) | void) | undefined;

  class FakeMap {
    removed = false;
    constructor() {
      calls.push("new Map");
      maps.push(this);
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
      return this;
    }
  }

  return {
    calls,
    maps,
    FakeMap,
    FakeMarker,
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

afterEach(() => {
  lib.calls.length = 0;
  lib.maps.length = 0;
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
