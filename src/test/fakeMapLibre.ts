import type { ReactElement, ReactNode } from "react";

type Handler = (e: object) => void;
type Effect = { deps?: unknown[]; cleanup?: (() => void) | void };

export const maps: FakeMap[] = [];
/** Every path the fake style loader was asked for, in order. */
export const styleLoads: string[] = [];
/** Paths the fake style loader fails on. */
export const styleFailures = new Set<string>();
export const markers: FakeMarker[] = [];
/**
 * How the next FakeMap opens: a camera already set (as MapLibre's fit at
 * construction would) and the container's size. Cleared by resetFakes.
 */
export const nextMap: {
  camera?: { lng: number; lat?: number; zoom: number };
  width?: number;
  height?: number;
} = {};
export const frames: FrameRequestCallback[] = [];

const hooks = {
  refs: [] as { current: unknown }[],
  states: [] as unknown[],
  effects: [] as Effect[],
  pending: [] as (() => void)[],
  ref: 0,
  state: 0,
  effect: 0,
};

/** Enough of a DOM element for the attributes and listeners the map sets. */
export class FakeElement {
  style = {};
  offsetWidth = 0;
  attributes: Record<string, string> = {};
  listeners: { type: string; fn: (e: Event) => void; capture: boolean }[] = [];
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  addEventListener(type: string, fn: (e: Event) => void, capture = false) {
    this.listeners.push({ type, fn, capture });
  }
  removeEventListener(type: string, fn: (e: Event) => void, capture = false) {
    this.listeners = this.listeners.filter(
      (l) => !(l.type === type && l.fn === fn && l.capture === capture),
    );
  }
}

export class FakeMap {
  handlers: Record<string, Handler[]> = {};
  layers: string[] = [];
  specs: Record<string, Record<string, unknown>> = {};
  sources: Record<string, { data: unknown }> = {};
  eased = 0;
  removed = false;
  afterCanvas: unknown[] = [];
  keyboard = { disableRotation() {} };
  touchZoomRotate = { disableRotation() {} };
  constructor(readonly options: Record<string, unknown>) {
    maps.push(this);
    if (nextMap.camera) this.camera = { ...nextMap.camera };
    if (nextMap.width !== undefined) this.width = nextMap.width;
    if (nextMap.height !== undefined) this.height = nextMap.height;
  }
  styles: { style: unknown; options: unknown }[] = [];
  on(event: string, fn: Handler) {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }
  off(event: string, fn: Handler) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((f) => f !== fn);
    return this;
  }
  fire(event: string, e: object = {}) {
    for (const fn of this.handlers[event] ?? []) fn(e);
  }
  setStyle(style: unknown, options: unknown) {
    this.styles.push({ style, options });
    return this;
  }
  addSource(id: string, source: { data: unknown }) {
    this.sources[id] = source;
    return this;
  }
  addLayer(layer: { id: string }) {
    this.layers.push(layer.id);
    this.specs[layer.id] = layer;
    return this;
  }
  getSource(id: string) {
    const source = this.sources[id];
    return (
      source && {
        setData: (data: unknown) => {
          source.data = data;
        },
      }
    );
  }
  point = { x: 0, y: 0 };
  camera: { lng: number; lat?: number; zoom: number } | undefined;
  width = 400;
  height = 800;
  getZoom() {
    return this.camera?.zoom ?? 0;
  }
  project(at: [number, number] | { lng: number; lat?: number }) {
    if (!this.camera) return this.point;
    const [lng, lat] = Array.isArray(at) ? at : [at.lng, at.lat ?? 0];
    const worldPx = 512 * 2 ** this.camera.zoom;
    const mercY = (l: number) =>
      Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360)) / (2 * Math.PI);
    return {
      x: this.width / 2 + ((lng - this.camera.lng) / 360) * worldPx,
      y: this.height / 2 + (mercY(this.camera.lat ?? 0) - mercY(lat)) * worldPx,
    };
  }
  /**
   * The inverse of project. With no camera set yet it reads the map as if it
   * sat at zoom 0 over 0, 0, which is where a cloud is placed at mount.
   */
  unproject([x, y]: [number, number]) {
    const camera = this.camera ?? { lng: 0, lat: 0, zoom: 0 };
    const worldPx = 512 * 2 ** camera.zoom;
    const mercY = (l: number) =>
      Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360)) / (2 * Math.PI);
    const merc = mercY(camera.lat ?? 0) - (y - this.height / 2) / worldPx;
    return {
      lng: camera.lng + ((x - this.width / 2) / worldPx) * 360,
      lat:
        (Math.atan(Math.exp(2 * Math.PI * merc)) - Math.PI / 4) *
        (360 / Math.PI),
    };
  }
  getCanvas() {
    return { after: (el: unknown) => this.afterCanvas.push(el) };
  }
  canvasContainer = new FakeElement();
  getCanvasContainer() {
    return this.canvasContainer;
  }
  getContainer() {
    return { clientWidth: this.width, clientHeight: this.height };
  }
  getCenter() {
    return { lng: this.camera?.lng ?? 0, lat: this.camera?.lat ?? 0 };
  }
  easeTo() {
    this.eased++;
  }
  fitted: { bounds: unknown; options: unknown }[] = [];
  fitBounds(bounds: unknown, options: unknown) {
    this.fitted.push({ bounds, options });
    return this;
  }
  remove() {
    this.removed = true;
  }
}

export class FakeMarker {
  lngLat: [number, number] | undefined;
  removed = false;
  constructor(readonly options: Record<string, unknown> = {}) {
    markers.push(this);
  }
  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  getLngLat() {
    const [lng, lat] = this.lngLat ?? [0, 0];
    return { lng, lat };
  }
  addTo(map: FakeMap) {
    map.on("move", () => this.wrapToward(map.camera));
    return this;
  }
  private wrapToward(camera: FakeMap["camera"]) {
    if (!camera || !this.lngLat) return;
    let [lng] = this.lngLat;
    while (lng - camera.lng > 180) lng -= 360;
    while (camera.lng - lng > 180) lng += 360;
    this.lngLat = [lng, this.lngLat[1]];
  }
  remove() {
    this.removed = true;
    return this;
  }
}

class FakeBounds {
  extend() {
    return this;
  }
}

/** What the fake style loader resolves a path to. */
export function stubStyle(path: string) {
  return { version: 8, name: path, sources: {}, layers: [] };
}

/** Stands in for loadMapStyle in src/components/mapStyle.ts, with no fetch. */
export const fakeMapStyle = {
  loadMapStyle: async (path: string) => {
    styleLoads.push(path);
    if (styleFailures.has(path)) throw new Error(`Map style ${path} failed`);
    return stubStyle(path);
  },
};

export const fakeMaplibre = {
  Map: FakeMap,
  Marker: FakeMarker,
  LngLatBounds: FakeBounds,
  setWorkerUrl: () => {},
};

export function fakeReact(react: typeof import("react")) {
  return {
    ...react,
    useRef: <T>(initial: T) =>
      (hooks.refs[hooks.ref++] ??= {
        current: initial ?? new FakeElement(),
      }) as {
        current: T;
      },
    useState: <T>(initial: T | (() => T)) => {
      const k = hooks.state++;
      if (!(k in hooks.states)) {
        hooks.states[k] =
          typeof initial === "function" ? (initial as () => T)() : initial;
      }
      const set = (next: T | ((prev: T) => T)) => {
        hooks.states[k] =
          typeof next === "function"
            ? (next as (prev: T) => T)(hooks.states[k] as T)
            : next;
      };
      return [hooks.states[k] as T, set] as const;
    },
    useEffect: (fn: () => (() => void) | void, deps?: unknown[]) => {
      const k = hooks.effect++;
      const prev = hooks.effects[k];
      const changed =
        !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps?.[i]));
      if (!changed) return;
      hooks.pending.push(() => {
        if (prev?.cleanup) prev.cleanup();
        hooks.effects[k] = { deps, cleanup: fn() };
      });
    },
  };
}

export function renderWithEffects<P>(
  component: (props: P) => ReactNode,
  props: P,
): ReactNode {
  hooks.ref = 0;
  hooks.state = 0;
  hooks.effect = 0;
  hooks.pending = [];
  const tree = component(props);
  for (const run of hooks.pending) run();
  return tree;
}

export function resetFakes() {
  for (const e of hooks.effects) if (e?.cleanup) e.cleanup();
  hooks.refs = [];
  hooks.states = [];
  hooks.effects = [];
  maps.length = 0;
  markers.length = 0;
  styleLoads.length = 0;
  styleFailures.clear();
  frames.length = 0;
  delete nextMap.camera;
  delete nextMap.width;
  delete nextMap.height;
  fakeDocument.hidden = false;
  fakeDocument.listeners = {};
}

export function stubBrowser(vi: {
  stubGlobal: (name: string, value: unknown) => unknown;
}) {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
}

export const fakeDocument = {
  hidden: false,
  listeners: {} as Record<string, (() => void)[]>,
  addEventListener(event: string, fn: () => void) {
    (this.listeners[event] ??= []).push(fn);
  },
  removeEventListener(event: string, fn: () => void) {
    this.listeners[event] = (this.listeners[event] ?? []).filter(
      (f) => f !== fn,
    );
  },
  fire(event: string) {
    for (const fn of this.listeners[event] ?? []) fn();
  },
};

export function nextFrame() {
  frames.at(-1)?.(0);
}

export function find(node: ReactNode, type: unknown): ReactElement | undefined {
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
