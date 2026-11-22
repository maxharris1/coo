import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { snap } from "@/lib/game/privacy";
import { PinMap } from "./PinMap";

const lib = vi.hoisted(() => {
  const calls: string[] = [];
  const maps: FakeMap[] = [];
  let effect: (() => (() => void) | void) | undefined;

  type Handler = (e: { lngLat: { lat: number; lng: number } }) => void;

  class FakeMap {
    removed = false;
    resizes = 0;
    handlers: Record<string, Handler> = {};
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
    on(type: string, fn: Handler) {
      this.handlers[type] = fn;
      return this;
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

  const markers: FakeMarker[] = [];
  class FakeMarker {
    at: [number, number] = [0, 0];
    handlers: Record<string, () => void> = {};
    constructor(readonly options: Record<string, unknown>) {
      markers.push(this);
    }
    setLngLat(at: [number, number]) {
      this.at = at;
      return this;
    }
    getLngLat() {
      return { lng: this.at[0], lat: this.at[1] };
    }
    on(type: string, fn: () => void) {
      this.handlers[type] = fn;
      return this;
    }
    addTo() {
      return this;
    }
  }

  return {
    calls,
    maps,
    markers,
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
  lib.markers.length = 0;
  lib.observers.clear();
  vi.unstubAllGlobals();
});

const roost = { start: { lat: 40.749, lon: -73.972 }, label: "Tudor City" };

it("resizes the map when its 0x0 container later gets a 16/10 box", async () => {
  PinMap(roost);
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
  PinMap(roost);
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.maps).toHaveLength(1));
  expect(lib.maps[0].options.attributionControl).toEqual({ compact: true });
  cleanup();
});

it("points MapLibre at its bundled worker before creating the map", async () => {
  PinMap({ start: { lat: 40.7, lon: -74 }, label: "Brooklyn" });
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.maps).toHaveLength(1));
  expect(lib.calls).toEqual([
    expect.stringMatching(/^setWorkerUrl .*maplibre-gl-worker\.mjs$/),
    "new Map",
  ]);
  cleanup();
  expect(lib.maps[0].removed, "map removed on unmount").toBe(true);
});

it("with no move handler, shows a fixed pin on a still map in OpenFreeMap's stock style", async () => {
  PinMap(roost);
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.markers).toHaveLength(1));
  const [map] = lib.maps;
  const [marker] = lib.markers;
  expect(map.options).toMatchObject({
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-73.972, 40.749],
    zoom: 15,
    interactive: false,
  });
  expect(Object.keys(marker.options)).toEqual(["element"]);
  expect(marker.at).toEqual([-73.972, 40.749]);
  expect(map.handlers, "no tap handler").toEqual({});
  expect(marker.handlers, "no drag handler").toEqual({});
  cleanup();
});

it("settles a dragged pin and reports where it settled", async () => {
  const moves: unknown[] = [];
  PinMap({ ...roost, onMove: (p) => moves.push(p), settle: snap });
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.markers).toHaveLength(1));
  const [marker] = lib.markers;
  expect(lib.maps[0].options.interactive).toBe(true);
  expect(marker.options.draggable).toBe(true);

  marker.setLngLat([-73.96143, 40.71427]);
  marker.handlers.dragend();

  expect(marker.at, "pin jumped to the grid").toEqual([-73.9625, 40.714]);
  expect(moves).toEqual([{ lat: 40.714, lon: -73.9625 }]);
  cleanup();
});

it("moves the pin to a tapped spot, settled", async () => {
  const moves: unknown[] = [];
  PinMap({ ...roost, onMove: (p) => moves.push(p), settle: snap });
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.markers).toHaveLength(1));

  lib.maps[0].handlers.click({ lngLat: { lat: 40.71427, lng: -73.96143 } });

  expect(lib.markers[0].at).toEqual([-73.9625, 40.714]);
  expect(moves).toEqual([{ lat: 40.714, lon: -73.9625 }]);
  cleanup();
});

it("keeps the exact spot when no settle is given", async () => {
  const moves: unknown[] = [];
  PinMap({ ...roost, onMove: (p) => moves.push(p) });
  const cleanup = lib.runEffect() as () => void;
  await vi.waitFor(() => expect(lib.markers).toHaveLength(1));

  lib.maps[0].handlers.click({ lngLat: { lat: 40.71427, lng: -73.96143 } });

  expect(moves).toEqual([{ lat: 40.71427, lon: -73.96143 }]);
  cleanup();
});
