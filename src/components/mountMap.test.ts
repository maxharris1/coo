import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountMap } from "./mountMap";

class FakeMap {
  resizes = 0;
  removed = 0;
  constructor(readonly options: Record<string, unknown>) {}
  resize() {
    this.resizes += 1;
    return this;
  }
  remove() {
    this.removed += 1;
  }
}

class FakeObserver {
  static live: FakeObserver[] = [];
  observed: unknown[] = [];
  constructor(readonly fire: () => void) {
    FakeObserver.live.push(this);
  }
  observe(el: unknown) {
    this.observed.push(el);
  }
  disconnect() {
    FakeObserver.live = FakeObserver.live.filter((o) => o !== this);
  }
}

const lib = {
  Map: FakeMap,
  setWorkerUrl: vi.fn(),
} as unknown as Parameters<typeof mountMap>[0];

function box(width: number, height: number) {
  return { clientWidth: width, clientHeight: height } as HTMLElement & {
    clientWidth: number;
    clientHeight: number;
  };
}

function report() {
  for (const o of FakeObserver.live) o.fire();
}

beforeEach(() => {
  FakeObserver.live = [];
  vi.stubGlobal("ResizeObserver", FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("resizes once when a 0x0 container later gets a 16/10 box", () => {
  const container = box(0, 0);
  const { map } = mountMap(
    lib,
    container,
    { center: [0, 0], zoom: 15 },
    {
      compact: true,
    },
  );
  const fake = map as unknown as FakeMap;
  report();
  expect(fake.resizes, "no resize while still 0x0").toBe(0);

  Object.assign(container, { clientWidth: 320, clientHeight: 200 });
  report();
  expect(fake.resizes, "resized once the box is 320x200").toBe(1);

  report();
  expect(fake.resizes, "same box again does not resize").toBe(1);
});

it("does not resize when the box is unchanged since construction", () => {
  const { map } = mountMap(lib, box(320, 200), {}, { compact: true });
  report();
  expect((map as unknown as FakeMap).resizes).toBe(0);
});

it("passes the attribution control without customAttribution", () => {
  const { map } = mountMap(lib, box(320, 200), {}, { compact: false });
  expect((map as unknown as FakeMap).options.attributionControl).toEqual({
    compact: false,
  });
});

it("points MapLibre at its bundled worker", () => {
  mountMap(lib, box(320, 200), {}, { compact: true });
  expect(lib.setWorkerUrl).toHaveBeenCalledWith(
    expect.stringMatching(/maplibre-gl-worker\.mjs$/),
  );
});

it("dispose disconnects the observer and removes the map once", () => {
  const container = box(0, 0);
  const { map, dispose } = mountMap(lib, container, {}, { compact: true });
  dispose();
  dispose();
  expect(FakeObserver.live, "observer disconnected").toHaveLength(0);
  expect((map as unknown as FakeMap).removed, "removed exactly once").toBe(1);
});
