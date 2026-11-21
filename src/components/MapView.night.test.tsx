import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { Flight } from "@/server/services/flights/shape";
import { MapView } from "./MapView";
import { Tracker } from "./Tracker";

const NIGHT_STYLE = "/map/coo-night.style.json";
const DAY_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const lib = vi.hoisted(() => {
  type Effect = { deps?: unknown[]; cleanup?: (() => void) | void };
  const hooks = {
    refs: [] as { current: unknown }[],
    effects: [] as Effect[],
    pending: [] as (() => void)[],
    ref: 0,
    effect: 0,
  };

  class FakeMap {
    removed = false;
    styles: { style: unknown; options: unknown }[] = [];
    handlers: Record<string, ((e: object) => void)[]> = {};
    layers: string[] = [];
    keyboard = { disableRotation() {} };
    touchZoomRotate = { disableRotation() {} };
    constructor(readonly options: Record<string, unknown>) {
      maps.push(this);
    }
    on(event: string, fn: (e: object) => void) {
      (this.handlers[event] ??= []).push(fn);
      return this;
    }
    fire(event: string) {
      for (const fn of this.handlers[event] ?? []) fn({});
    }
    setStyle(style: unknown, options: unknown) {
      this.styles.push({ style, options });
      this.layers = [];
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
      return undefined;
    }
    remove() {
      this.removed = true;
    }
  }
  const maps: FakeMap[] = [];

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

  return { hooks, maps, FakeMap, FakeMarker, FakeBounds };
});

vi.mock("maplibre-gl", () => ({
  Map: lib.FakeMap,
  Marker: lib.FakeMarker,
  LngLatBounds: lib.FakeBounds,
  setWorkerUrl: () => {},
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: <T,>(initial: T) =>
    (lib.hooks.refs[lib.hooks.ref++] ??= {
      current: initial ?? {},
    }) as { current: T },
  useState: <T,>(initial: T | (() => T)) => [
    typeof initial === "function" ? (initial as () => T)() : initial,
    () => {},
  ],
  useEffect: (fn: () => (() => void) | void, deps?: unknown[]) => {
    const k = lib.hooks.effect++;
    const prev = lib.hooks.effects[k];
    const changed =
      !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps?.[i]));
    if (!changed) return;
    lib.hooks.pending.push(() => {
      if (prev?.cleanup) prev.cleanup();
      lib.hooks.effects[k] = { deps, cleanup: fn() };
    });
  },
}));

type Vector = { name: string; input: FlightInput; plan: FlightPlan };

const vectors: Vector[] = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors;

function chicago(): Flight {
  const v = vectors.find((x) => x.name === "chicago-overnight")!;
  return {
    id: v.input.flightId,
    kind: "delivery",
    status: "flying",
    bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
    owner: { id: "u1", name: "Max", handle: "max" },
    counterpart: { id: "u2", name: "Priya", handle: "priya" },
    from: { ...v.input.from, label: "Brooklyn" },
    to: { ...v.input.to, label: "Chicago" },
    releaseAt: v.plan.segments[0].startMs,
    arriveAt: v.plan.arriveAtMs,
    distanceMi: v.plan.distanceMi,
    plan: v.plan,
    input: v.input,
    placeNames: {},
    role: "mine",
    hasNote: true,
  };
}

function findMapView(node: ReactNode): ReactElement | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findMapView(child);
      if (found) return found;
    }
    return undefined;
  }
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (el.type === MapView) return el;
  return findMapView(el.props?.children);
}

function renderTracker(flight: Flight) {
  lib.hooks.ref = 0;
  lib.hooks.effect = 0;
  lib.hooks.pending = [];
  const tree = Tracker({
    flight,
    offsetMs: 0,
    timeZone: "America/New_York",
    units: "mi",
  });
  const map = findMapView(tree);
  if (!map) throw new Error("Tracker rendered no MapView");
  MapView(map.props as Parameters<typeof MapView>[0]);
  for (const run of lib.hooks.pending) run();
}

async function mapCreated() {
  await vi.waitFor(() => expect(lib.maps.length).toBe(1));
  return lib.maps[0];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  lib.hooks.refs = [];
  lib.hooks.effects = [];
  lib.maps.length = 0;
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  for (const e of lib.hooks.effects) if (e?.cleanup) e.cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the tracker map on the Chicago vector (ac-2)", () => {
  it("requests the night style when opened at 2 am", async () => {
    vi.setSystemTime(Date.parse("2026-11-20T02:00:00-05:00"));
    renderTracker(chicago());
    const map = await mapCreated();
    expect(map.options.style, "initial style at 2 am").toBe(NIGHT_STYLE);
  });

  it("switches to the night style when the sun sets on an open map", async () => {
    const flight = chicago();
    vi.setSystemTime(Date.parse("2026-11-19T12:00:00-05:00"));
    renderTracker(flight);
    const map = await mapCreated();
    expect(map.options.style, "initial style at noon").toBe(DAY_STYLE);
    expect(map.styles, "no style change while it stays light").toEqual([]);

    vi.setSystemTime(Date.parse("2026-11-20T02:00:00-05:00"));
    renderTracker(flight);
    expect(map.styles.map((s) => s.style), "style requests at 2 am").toEqual([
      NIGHT_STYLE,
    ]);
    expect(lib.maps.length, "the same map is restyled, not rebuilt").toBe(1);

    map.fire("style.load");
    expect(map.layers, "route redrawn on the night style").toEqual([
      "route-left",
      "route-flown-casing",
      "route-flown",
    ]);
  });
});
