import type { ReactElement, ReactNode } from "react";

type Handler = (e: object) => void;
type Effect = { deps?: unknown[]; cleanup?: (() => void) | void };

export const maps: FakeMap[] = [];
export const markers: FakeMarker[] = [];
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
  }
  on(event: string, fn: Handler) {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }
  fire(event: string) {
    for (const fn of this.handlers[event] ?? []) fn({});
  }
  setStyle() {
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
      y: 400 + (mercY(this.camera.lat ?? 0) - mercY(lat)) * worldPx,
    };
  }
  getCanvas() {
    return { after: (el: unknown) => this.afterCanvas.push(el) };
  }
  getContainer() {
    return { clientWidth: this.width, clientHeight: 800 };
  }
  easeTo() {
    this.eased++;
  }
  remove() {
    this.removed = true;
  }
}

export class FakeMarker {
  lngLat: [number, number] | undefined;
  constructor() {
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
    return this;
  }
}

class FakeBounds {
  extend() {
    return this;
  }
}

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
        current: initial ?? { style: {}, offsetWidth: 0 },
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
  frames.length = 0;
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
