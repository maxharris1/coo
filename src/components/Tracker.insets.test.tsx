import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFlight, fakeNow, parseFake } from "@/app/dev/map/fakeFlight";
import { find, renderWithEffects, resetFakes } from "@/test/fakeMapLibre";
import { MapView } from "./MapView";
import { Tracker } from "./Tracker";
import { PIN_ROOM_PX, insetsOf } from "./useMapInsets";

vi.mock("react", async (importOriginal) =>
  (await import("@/test/fakeMapLibre")).fakeReact(
    await importOriginal<typeof import("react")>(),
  ),
);

type Box = { offsetTop: number; offsetHeight: number };
let observed: Box[] = [];
let onResize: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  observed = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        onResize = cb;
      }
      observe(el: Box) {
        observed.push(el);
      }
      disconnect() {}
    },
  );
});

afterEach(() => {
  resetFakes();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the tracker keeps its map clear of the card and header", () => {
  const params = parseFake({});
  const props = {
    flight: fakeFlight(params),
    offsetMs: 0,
    timeZone: "America/New_York",
    units: "mi" as const,
  };

  it("passes the measured card height as camera padding and credit lift", () => {
    vi.setSystemTime(fakeNow(params));
    let tree = renderWithEffects(Tracker, props);
    expect(find(tree, MapView)?.props, "before measuring").toMatchObject({
      topPadding: 80,
      bottomPadding: 260,
      controlsBottom: 260,
    });
    const [card, header] = observed;
    expect(observed, "card and header observed").toHaveLength(2);
    Object.assign(card, { offsetTop: 431, offsetHeight: 329 });
    Object.assign(header, { offsetTop: 16, offsetHeight: 44 });
    onResize();
    tree = renderWithEffects(Tracker, props);
    expect(find(tree, MapView)?.props).toMatchObject({
      topPadding: 16 + 44 + PIN_ROOM_PX,
      bottomPadding: 329,
      controlsBottom: 329,
    });
  });

  it("falls back until a measurement arrives", () => {
    const fallback = { top: 80, bottom: 260 };
    expect(
      insetsOf({ offsetTop: 0, offsetHeight: 0 }, null, fallback),
    ).toEqual(fallback);
    expect(
      insetsOf(
        { offsetTop: 0, offsetHeight: 304.4 },
        { offsetTop: 12, offsetHeight: 40 },
        fallback,
      ),
    ).toEqual({ top: 12 + 40 + PIN_ROOM_PX, bottom: 304 });
  });
});
