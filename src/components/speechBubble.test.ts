import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bubbleSide, startBubble } from "./speechBubble";

describe("startBubble (#967 ac-3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function run(random: () => number, dragging = () => false) {
    const seen: string[] = [];
    const stop = startBubble({
      show: () => seen.push("show"),
      hide: () => seen.push("hide"),
      dragging,
      random,
    });
    return { seen, stop };
  }

  it.each([
    [0, 20_000],
    [0.5, 30_000],
    [1, 40_000],
  ])("with random %d waits %d ms before showing", (r, gap) => {
    const { seen } = run(() => r);
    vi.advanceTimersByTime(gap - 1);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["show"]);
  });

  it("shows for 4 s then waits another gap and shows again", () => {
    const { seen } = run(() => 0);
    vi.advanceTimersByTime(20_000 + 3_999);
    expect(seen).toEqual(["show"]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["show", "hide"]);
    vi.advanceTimersByTime(19_999);
    expect(seen).toEqual(["show", "hide"]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["show", "hide", "show"]);
  });

  it("skips a showing that falls during a drag and tries again after the next gap", () => {
    let dragging = true;
    const { seen } = run(
      () => 0,
      () => dragging,
    );
    vi.advanceTimersByTime(20_000 + 4_000);
    expect(seen).toEqual([]);
    dragging = false;
    vi.advanceTimersByTime(15_999);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["show"]);
  });

  it("shows nothing more once stopped, even mid-showing", () => {
    const { seen, stop } = run(() => 0);
    vi.advanceTimersByTime(20_000);
    stop();
    vi.advanceTimersByTime(120_000);
    expect(seen).toEqual(["show"]);
  });
});

describe("bubbleSide (#967 ac-3)", () => {
  it.each<[number, boolean, "left" | "right"]>([
    [200, false, "left"],
    [101, false, "left"],
    [100, false, "right"],
    [20, false, "right"],
    [300, false, "left"],
    [200, true, "right"],
    [289, true, "right"],
    [290, true, "left"],
    [380, true, "left"],
    [20, true, "right"],
  ])(
    "a bird at x %d on a 390 map heading west=%s talks on the %s",
    (birdX, west, side) => {
      expect(bubbleSide({ birdX, mapWidth: 390, west })).toBe(side);
    },
  );
});
