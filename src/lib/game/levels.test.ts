import { describe, expect, it } from "vitest";
import { levelFor, rangeFor } from "@/lib/game/levels";

describe("levelFor", () => {
  it.each([
    [0, 1],
    [24.9, 1],
    [25, 2],
    [100, 3],
    [225, 4],
    [400, 5],
    [2024, 9],
    [2025, 10],
    [99999, 10],
  ])("puts a bird with %d miles at level %d", (miles, level) => {
    expect(levelFor(miles)).toBe(level);
  });

  it("treats negative miles as level 1", () => {
    expect(levelFor(-50)).toBe(1);
  });
});

describe("rangeFor", () => {
  it("shows 320 miles for a 45 mph bird", () => {
    expect(rangeFor(45)).toBe(320);
  });
});

describe("determinism", () => {
  it("gives equal outputs for the same inputs", () => {
    for (const n of [0, 25, 45, 54, 2025]) {
      expect(levelFor(n)).toEqual(levelFor(n));
      expect(rangeFor(n)).toEqual(rangeFor(n));
    }
  });
});
