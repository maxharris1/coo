import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { snap } from "@/lib/game/privacy";
import { PinMap, type PinMapProps } from "./PinMap";

const lib = vi.hoisted(() => {
  const calls: string[] = [];
  const maps: FakeMap[] = [];
  type Effect = () => (() => void) | void;
  const hooks = {
    refs: [] as { current: unknown }[],
    elementRefs: 2,
    ref: 0,
    effects: [] as { fn: Effect; deps?: unknown[] }[],
    deps: [] as (unknown[] | undefined)[],
    cleanups: [] as ((() => void) | void)[],
  };

  type Handler = (e: { lngLat: { lat: number; lng: number } }) => void;

  class FakeMap {
    removed = false;
    resizes = 0;
    center: [number, number] | null = null;
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
    setCenter(at: [number, number]) {
      this.center = at;
      return this;
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
    hooks,
    useRef: <T>(initial: T) => {
      const i = hooks.ref++;
      const element = i < hooks.elementRefs;
      hooks.refs[i] ??= { current: element ? {} : initial };
      return hooks.refs[i];
    },
    useEffect: (fn: Effect, deps?: unknown[]) => {
      hooks.effects.push({ fn, deps });
    },
    commit: () => {
      hooks.effects.forEach(({ fn, deps }, i) => {
        const prev = hooks.deps[i];
        const changed =
          !deps || !prev || deps.some((d, j) => !Object.is(d, prev[j]));
        if (!changed) return;
        hooks.cleanups[i]?.();
        hooks.cleanups[i] = fn();
        hooks.deps[i] = deps;
      });
    },
    unmount: () => {
      hooks.cleanups.forEach((c) => c?.());
    },
  };
});

vi.mock("maplibre-gl", () => ({
  Map: lib.FakeMap,
  Marker: lib.FakeMarker,
  setWorkerUrl: lib.setWorkerUrl,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: lib.useRef,
  useEffect: lib.useEffect,
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", lib.FakeObserver);
});

afterEach(() => {
  lib.calls.length = 0;
  lib.maps.length = 0;
  lib.markers.length = 0;
  lib.observers.clear();
  Object.assign(lib.hooks, {
    refs: [],
    ref: 0,
    effects: [],
    deps: [],
    cleanups: [],
  });
  vi.unstubAllGlobals();
});

const render = (props: PinMapProps) => {
  lib.hooks.ref = 0;
  lib.hooks.effects = [];
  const view = PinMap(props);
  lib.commit();
  return view;
};

const roost = { start: { lat: 40.749, lon: -73.972 }, label: "Tudor City" };

it("resizes the map when its 0x0 container later gets a 16/10 box", async () => {
  render(roost);
  const cleanup = lib.unmount;
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
  render(roost);
  const cleanup = lib.unmount;
  await vi.waitFor(() => expect(lib.maps).toHaveLength(1));
  expect(lib.maps[0].options.attributionControl).toEqual({ compact: true });
  cleanup();
});

it("points MapLibre at its bundled worker before creating the map", async () => {
  render({ start: { lat: 40.7, lon: -74 }, label: "Brooklyn" });
  const cleanup = lib.unmount;
  await vi.waitFor(() => expect(lib.maps).toHaveLength(1));
  expect(lib.calls).toEqual([
    expect.stringMatching(/^setWorkerUrl .*maplibre-gl-worker\.mjs$/),
    "new Map",
  ]);
  cleanup();
  expect(lib.maps[0].removed, "map removed on unmount").toBe(true);
});

it("with no move handler, shows a fixed pin on a still map in OpenFreeMap's stock style", async () => {
  render(roost);
  const cleanup = lib.unmount;
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

it("reports a dragged pin's settled spot and keeps showing the accepted roost", async () => {
  const moves: unknown[] = [];
  render({ ...roost, onMove: (p) => moves.push(p), settle: snap });
  const cleanup = lib.unmount;
  await vi.waitFor(() => expect(lib.markers).toHaveLength(1));
  const [marker] = lib.markers;
  expect(lib.maps[0].options.interactive).toBe(true);
  expect(marker.options.draggable).toBe(true);

  marker.setLngLat([-73.96143, 40.71427]);
  marker.handlers.dragend();

  expect(moves).toEqual([{ lat: 40.714, lon: -73.9625 }]);
  expect(marker.at, "pin back on the accepted roost").toEqual([
    -73.972, 40.749,
  ]);
  cleanup();
});

it("reports a tapped spot, settled, without moving the pin itself", async () => {
  const moves: unknown[] = [];
  render({ ...roost, onMove: (p) => moves.push(p), settle: snap });
  const cleanup = lib.unmount;
  await vi.waitFor(() => expect(lib.markers).toHaveLength(1));

  lib.maps[0].handlers.click({ lngLat: { lat: 40.71427, lng: -73.96143 } });

  expect(moves).toEqual([{ lat: 40.714, lon: -73.9625 }]);
  expect(lib.markers[0].at).toEqual([-73.972, 40.749]);
  cleanup();
});

it("shows the move the parent accepted, not a later one it ignored", async () => {
  const moves: { lat: number; lon: number }[] = [];
  const props = {
    ...roost,
    onMove: (p: { lat: number; lon: number }) => moves.push(p),
    settle: snap,
  };
  render(props);
  const cleanup = lib.unmount;
  await vi.waitFor(() => expect(lib.markers).toHaveLength(1));
  const [map] = lib.maps;
  const [marker] = lib.markers;

  map.handlers.click({ lngLat: { lat: 40.7141, lng: -73.9624 } });
  map.handlers.click({ lngLat: { lat: 40.7201, lng: -73.9701 } });
  expect(moves).toEqual([
    { lat: 40.714, lon: -73.9625 },
    { lat: 40.72, lon: -73.97 },
  ]);
  expect(marker.at, "nothing accepted yet").toEqual([-73.972, 40.749]);

  render({ ...props, start: moves[0] });

  expect(lib.maps, "same map, not a new one").toHaveLength(1);
  expect(marker.at, "pin on the accepted move").toEqual([-73.9625, 40.714]);
  expect(map.center).toEqual([-73.9625, 40.714]);
  cleanup();
});

it("keeps the exact spot when no settle is given", async () => {
  const moves: unknown[] = [];
  render({ ...roost, onMove: (p) => moves.push(p) });
  const cleanup = lib.unmount;
  await vi.waitFor(() => expect(lib.markers).toHaveLength(1));

  lib.maps[0].handlers.click({ lngLat: { lat: 40.71427, lng: -73.96143 } });

  expect(moves).toEqual([{ lat: 40.71427, lon: -73.96143 }]);
  cleanup();
});

type Node = {
  props: {
    role?: string;
    tabIndex?: number;
    "aria-label"?: string;
    onKeyDown?: (e: { key: string; preventDefault: () => void }) => void;
    children?: Node | Node[];
  };
};
const pinOf = (view: unknown) => {
  const holder = (view as Node).props.children as Node[];
  return holder[1].props.children as Node;
};

it("gives the editable pin a labelled keyboard control that moves it one block", () => {
  const moves: unknown[] = [];
  const view = render({ ...roost, onMove: (p) => moves.push(p), settle: snap });
  expect((view as Node).props.role).toBe("group");
  const pin = pinOf(view).props;
  expect(pin).toMatchObject({
    role: "button",
    tabIndex: 0,
    "aria-label": "Roost pin at Tudor City. Arrow keys move it one block.",
  });

  const prevented: string[] = [];
  for (const key of ["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "a"]) {
    pin.onKeyDown!({ key, preventDefault: () => prevented.push(key) });
  }

  expect(moves).toEqual([
    snap(40.749, -73.972 + 0.0025),
    snap(40.749 + 0.002, -73.972),
    snap(40.749, -73.972 - 0.0025),
    snap(40.749 - 0.002, -73.972),
  ]);
  expect(prevented, "other keys left alone").toEqual([
    "ArrowRight",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
  ]);
  lib.unmount();
});

it("with no move handler, the pin is not focusable and the map stays an image", () => {
  const view = render(roost);
  expect((view as Node).props.role).toBe("img");
  const pin = pinOf(view).props;
  expect(pin.tabIndex).toBeUndefined();
  expect(pin.onKeyDown).toBeUndefined();
  lib.unmount();
});
