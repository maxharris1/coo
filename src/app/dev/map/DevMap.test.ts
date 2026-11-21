import { afterEach, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
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
    setEffect: (fn: typeof effect) => {
      effect = fn;
    },
    runEffect: () => effect!(),
  };
});

vi.mock("maplibre-gl", () => ({ Map: lib.FakeMap }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: <T>(initial: T) => ({ current: initial ?? ({} as T) }),
  useState: <T>(initial: T) => [initial, () => {}],
  useEffect: lib.setEffect,
}));

afterEach(() => {
  lib.maps.length = 0;
});

const capeCod = PLACES.find((p) => p.id === "cape-cod")!;

async function mount() {
  DevMap({ place: capeCod, zoom: 15 });
  const cleanup = lib.runEffect();
  await vi.waitFor(() => expect(lib.maps).toHaveLength(1));
  return { map: lib.maps[0], cleanup };
}

it("shows the full attribution, not the compact button", async () => {
  const { map } = await mount();
  expect(map.options.attributionControl).toEqual({
    compact: false,
    customAttribution: config.app.mapAttribution,
  });
});

it("loads the Coo day style at the chosen place and zoom", async () => {
  const { map } = await mount();
  expect(map.options).toMatchObject({
    style: "/map/coo-day.style.json",
    center: capeCod.center,
    zoom: 15,
  });
});

it("removes the map on unmount", async () => {
  const { map, cleanup } = await mount();
  (cleanup as () => void)();
  expect(map.removed).toBe(true);
});
