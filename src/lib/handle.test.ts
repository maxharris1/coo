import { describe, expect, it } from "vitest";
import { handleBase } from "./handle";

const HANDLE = /^[a-z0-9_]{2,20}$/;

describe("handleBase", () => {
  it.each([
    ["Max", "max"],
    ["max", "max"],
    ["Max Harris", "max_harris"],
    ["  Mary-Jane  ", "mary_jane"],
    ["O'Brien", "o_brien"],
    ["Zoë", "zoe"],
    ["José Ñúñez", "jose_nunez"],
    ["R2-D2", "r2_d2"],
    ["Jo", "jo"],
    ["already_ok_99", "already_ok_99"],
  ])("turns %j into %j", (name, handle) => {
    expect(handleBase(name)).toBe(handle);
  });

  it("caps the stem at 20 characters without a trailing underscore", () => {
    expect(handleBase("Bartholomew Featherstonehaugh")).toBe(
      "bartholomew_feathers",
    );
    expect(handleBase("abcdefghijklmnopqrs tuv")).toBe("abcdefghijklmnopqrs");
  });

  it.each(["", "   ", "!!!", "J", "李", "🐦", "_", "é"])(
    "falls back to a valid stem for %j",
    (name) => {
      expect(handleBase(name)).toMatch(HANDLE);
    },
  );

  it.each([
    "Max",
    "A very long name that keeps going and going",
    "  --Ünïcødé--  ",
    "x".repeat(200),
    "a_",
    "Ⅻ ﬁsh",
  ])("always returns a valid handle for %j", (name) => {
    expect(handleBase(name)).toMatch(HANDLE);
  });
});
