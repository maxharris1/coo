import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bird } from "@/components/Bird";
import { MapView } from "@/components/MapView";
import type { JobView } from "@/server/services/jobs/get";
import { JobTracker } from "./JobTracker";

const lib = vi.hoisted(() => {
  type Effect = { deps?: unknown[]; cleanup?: (() => void) | void };
  const hooks = {
    states: [] as unknown[],
    refs: [] as { current: unknown }[],
    memos: [] as { deps: unknown[]; value: unknown }[],
    effects: [] as Effect[],
    pending: [] as (() => void)[],
    state: 0,
    ref: 0,
    memo: 0,
    effect: 0,
  };
  const counts = {
    mounts: 0,
    disposals: 0,
    routeUpdates: 0,
    cameraUpdates: 0,
  };
  const changed = (prev: unknown[] | undefined, deps?: unknown[]) =>
    !prev || !deps || deps.some((d, i) => !Object.is(d, prev[i]));

  class FakeMap {
    keyboard = { disableRotation() {} };
    touchZoomRotate = { disableRotation() {} };
    constructor(readonly options: Record<string, unknown>) {
      counts.mounts++;
    }
    on() {
      return this;
    }
    off() {
      return this;
    }
    getSource() {
      return {
        setData() {
          counts.routeUpdates++;
        },
      };
    }
    project() {
      return { x: 0, y: 0 };
    }
    getZoom() {
      return 12;
    }
    getCanvas() {
      return { after() {} };
    }
    getContainer() {
      return { clientWidth: 400, clientHeight: 800 };
    }
    // A stand-in to place clouds with; it does not invert project.
    unproject([x, y]: [number, number]) {
      return { lng: x / 1000, lat: -y / 1000 };
    }
    getCenter() {
      return { lng: -74, lat: 41 };
    }
    easeTo() {
      counts.cameraUpdates++;
    }
    setStyle() {
      return this;
    }
    remove() {
      counts.disposals++;
    }
  }

  class FakeMarker {
    setLngLat() {
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

  const frame = { next: undefined as FrameRequestCallback | undefined };
  return { hooks, counts, frame, changed, FakeMap, FakeMarker, FakeBounds };
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
  useState: <T,>(initial: T | (() => T)) => {
    const k = lib.hooks.state++;
    if (!(k in lib.hooks.states)) {
      lib.hooks.states[k] =
        typeof initial === "function" ? (initial as () => T)() : initial;
    }
    const set = (next: T | ((prev: T) => T)) => {
      lib.hooks.states[k] =
        typeof next === "function"
          ? (next as (prev: T) => T)(lib.hooks.states[k] as T)
          : next;
    };
    return [lib.hooks.states[k] as T, set];
  },
  useRef: <T,>(initial: T) =>
    (lib.hooks.refs[lib.hooks.ref++] ??= {
      current: initial ?? { style: {} },
    }) as { current: T },
  useMemo: <T,>(fn: () => T, deps: unknown[]) => {
    const k = lib.hooks.memo++;
    const prev = lib.hooks.memos[k];
    if (!lib.changed(prev?.deps, deps)) return prev.value as T;
    const value = fn();
    lib.hooks.memos[k] = { deps, value };
    return value;
  },
  useEffect: (fn: () => (() => void) | void, deps?: unknown[]) => {
    const k = lib.hooks.effect++;
    const prev = lib.hooks.effects[k];
    if (!lib.changed(prev?.deps, deps)) return;
    lib.hooks.pending.push(() => {
      if (prev?.cleanup) prev.cleanup();
      lib.hooks.effects[k] = { deps, cleanup: fn() };
    });
  },
}));

const job: JobView = {
  id: "j1",
  jobId: "deli-slip",
  text: "Rush an order slip to the deli on 4th",
  short: "odd job for the deli",
  startedAt: "2026-11-22T15:00:00.000Z",
  endsAt: "2026-11-22T15:12:00.000Z",
  status: "running",
  bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
  map: {
    loft: { lat: 40.68, lon: -73.97, label: "Prospect Heights" },
    dest: { lat: 40.72, lon: -73.99, label: "the deli on 4th" },
  },
};

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

function render() {
  lib.hooks.state = 0;
  lib.hooks.ref = 0;
  lib.hooks.memo = 0;
  lib.hooks.effect = 0;
  lib.hooks.pending = [];
  const tree = JobTracker({
    job,
    offsetMs: 0,
    timeZone: "America/New_York",
  });
  const map = find(tree, MapView);
  if (!map) throw new Error("JobTracker rendered no MapView");
  const drawn = MapView(map.props as Parameters<typeof MapView>[0]);
  for (const run of lib.hooks.pending) run();
  const bird = find(drawn, Bird);
  if (!bird) throw new Error("MapView rendered no bird");
  return {
    flightId: (map.props as { flightId: string }).flightId,
    pose: (bird.props as { pose: string }).pose,
  };
}

async function mapMounted(n: number) {
  await vi.waitFor(() => expect(lib.counts.mounts).toBe(n));
}

async function tickSeconds(n: number) {
  for (let i = 0; i < n; i++) {
    vi.advanceTimersByTime(1000);
    lib.frame.next?.(0);
    render();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  lib.hooks.states = [];
  lib.hooks.refs = [];
  lib.hooks.memos = [];
  lib.hooks.effects = [];
  Object.assign(lib.counts, {
    mounts: 0,
    disposals: 0,
    routeUpdates: 0,
    cameraUpdates: 0,
  });
  lib.frame.next = undefined;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    lib.frame.next = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  for (const e of lib.hooks.effects) if (e?.cleanup) e.cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the job tracker map as the clock ticks (ac-1)", () => {
  it("keeps one map and follows the bird within a leg", async () => {
    vi.setSystemTime(Date.parse("2026-11-22T15:02:00.000Z"));
    render();
    await mapMounted(1);

    await tickSeconds(6);

    expect(lib.counts).toEqual({
      mounts: 1,
      disposals: 0,
      routeUpdates: 12,
      cameraUpdates: 1,
    });
  });

  it("swaps to the return leg at the midpoint with one remount", async () => {
    vi.setSystemTime(Date.parse("2026-11-22T15:05:57.000Z"));
    const out = render();
    expect(out.flightId).toBe("j1:out");
    expect(out.pose, "flying on the out leg").toBe("fly");
    await mapMounted(1);

    await tickSeconds(3);
    const back = render();
    expect(back.flightId, "return leg at the midpoint").toBe("j1:back");
    expect(back.pose, "still flying at the midpoint, never landed").toBe("fly");
    await mapMounted(2);

    await tickSeconds(3);
    expect(lib.counts.mounts, "one map per leg").toBe(2);
    expect(lib.counts.disposals, "only the out-leg map is gone").toBe(1);
  });
});
