import { describe, expect, it } from "vitest";
import { freeBirdName, sameBirdName } from "./birdName";

describe("sameBirdName", () => {
  it.each([
    ["Gerald", "Gerald"],
    ["Gerald", "gerald"],
    ["  GERALD ", "gerald"],
  ])("treats %j and %j as the same name", (a, b) => {
    expect(sameBirdName(a, b)).toBe(true);
  });

  it.each([
    ["Gerald", "Geraldine"],
    ["Pip", "P ip"],
  ])("treats %j and %j as different names", (a, b) => {
    expect(sameBirdName(a, b)).toBe(false);
  });
});

describe("freeBirdName", () => {
  const pool = ["Gerald", "Brenda", "Kevin"];

  it("keeps the preferred name when nothing taken matches it", () => {
    expect(freeBirdName("Gerald", ["Pip"], pool)).toBe("Gerald");
  });

  it("takes the first pool name nothing taken matches when the preferred one is taken", () => {
    expect(freeBirdName("Gerald", [" gerald"], pool)).toBe("Brenda");
    expect(freeBirdName("Gerald", ["Gerald", "BRENDA"], pool)).toBe("Kevin");
  });
});
