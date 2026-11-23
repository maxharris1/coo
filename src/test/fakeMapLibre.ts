import type { ReactElement, ReactNode } from "react";

type Handler = (e: object) => void;
type Effect = { deps?: unknown[]; cleanup?: (() => void) | void };

export const maps: FakeMap[] = [];
export const markers: FakeMarker[] = [];
export const frames: FrameRequestCallback[] = [];

const hooks = {
  refs: [] as { current: unknown }[],
  effects: [] as Effect[],
  pending: [] as (() => void)[],
  ref: 0,
  effect: 0,
};

export class FakeMap {
  handlers: Record<string, Handler[]> = {};
  layers: string[] = [];
  eased = 0;
  removed = false;
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
  addSource() {
    return this;
  }
  addLayer(layer: { id: string }) {
    this.layers.push(layer.id);
    return this;
  }
  getSource() {
    return { setData() {} };
  }
  project() {
    return { x: 0, y: 0 };
  }
  getContainer() {
    return { clientWidth: 400, clientHeight: 800 };
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
      (hooks.refs[hooks.ref++] ??= { current: initial ?? {} }) as {
        current: T;
      },
    useState: <T>(initial: T | (() => T)) => [
      typeof initial === "function" ? (initial as () => T)() : initial,
      () => {},
    ],
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
  hooks.effect = 0;
  hooks.pending = [];
  const tree = component(props);
  for (const run of hooks.pending) run();
  return tree;
}

export function resetFakes() {
  for (const e of hooks.effects) if (e?.cleanup) e.cleanup();
  hooks.refs = [];
  hooks.effects = [];
  maps.length = 0;
  markers.length = 0;
  frames.length = 0;
}

export function stubBrowser(vi: {
  stubGlobal: (name: string, value: unknown) => unknown;
}) {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
}

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
