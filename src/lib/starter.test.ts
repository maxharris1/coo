import { describe, expect, it } from "vitest";
import { nextStarterLook, roommateOwed } from "./starter";

describe("roommateOwed", () => {
  it.each([
    [0, 3, true],
    [1, 3, true],
    [2, 3, false],
    [1, 1, false],
    [3, 5, false],
  ])("is owed for %i birds on %i perches: %s", (birds, perches, owed) => {
    expect(roommateOwed(birds, perches)).toBe(owed);
  });
});

describe("nextStarterLook", () => {
  it.each([
    ["gerald", "brenda"],
    ["brenda", "kevin"],
    ["kevin", "gerald"],
  ])("follows %s with %s", (look, next) => {
    expect(nextStarterLook(look)).toBe(next);
  });
});
