import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stubStyleFetch, styleName } from "@/test/fakeMapLibre";
import { DevMap } from "./DevMap";
import { PLACES } from "./views";

const lib = vi.hoisted(() => {
  const maps: FakeMap[] = [];
  let effect: (() => (() => void) | void) | undefined;

  class FakeMap {
    removed = false;
    constructor(readonly options: Record<string, unknown>) {
      maps.push(this);
    }
    on() {
      return this;
    }
    remove() {
      this.removed = true;
    }
  }

  return {
    maps,
    FakeMap,
    setWorkerUrl: vi.fn(),
    setEffect: (fn: typeof effect) => {
      effect = fn;
    },
    runEffect: () => effect!(),
  };
});

vi.mock("maplibre-gl", () => ({
  Map: lib.FakeMap,
  setWorkerUrl: lib.setWorkerUrl,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: <T>(initial: T) => ({ current: initial ?? ({} as T) }),
  useState: <T>(initial: T) => [initial, () => {}],
  useEffect: lib.setEffect,
}));

let requested: string[] = [];

beforeEach(() => {
  requested = stubStyleFetch(vi);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  lib.maps.length = 0;
  vi.unstubAllGlobals();
});

const capeCod = PLACES.find((p) => p.id === "cape-cod")!;

async function mount(mode: "day" | "night" = "day") {
  DevMap({ place: capeCod, zoom: 15, mode });
  const cleanup = lib.runEffect();
  await vi.waitFor(() => expect(lib.maps).toHaveLength(1));
  return { map: lib.maps[0], cleanup };
}

it("shows the full attribution, not the compact button", async () => {
  const { map } = await mount();
  expect(map.options.attributionControl).toEqual({ compact: false });
});

it("loads the day style at the chosen place and zoom", async () => {
  const { map } = await mount();
  expect(requested).toEqual(["/map/coo-day.style.json"]);
  expect(styleName(map.options.style)).toBe("/map/coo-day.style.json");
  expect(map.options).toMatchObject({ center: capeCod.center, zoom: 15 });
});

it("loads the night style in night mode", async () => {
  const { map } = await mount("night");
  expect(requested).toEqual(["/map/coo-night.style.json"]);
  expect(styleName(map.options.style)).toBe("/map/coo-night.style.json");
});

it("removes the map on unmount", async () => {
  const { map, cleanup } = await mount();
  (cleanup as () => void)();
  expect(map.removed).toBe(true);
});

it("points MapLibre at its bundled worker before creating the map", async () => {
  await mount();
  expect(lib.setWorkerUrl).toHaveBeenCalledWith(
    expect.stringMatching(/maplibre-gl-worker\.mjs$/),
  );
});
