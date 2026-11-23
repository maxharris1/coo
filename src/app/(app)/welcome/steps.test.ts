import { describe, expect, it } from "vitest";
import { WELCOME_STEPS, welcomeStep } from "./steps";

describe("welcome steps", () => {
  it("runs first bird, then install, then loft", () => {
    expect(WELCOME_STEPS).toEqual([
      "/welcome/bird",
      "/welcome/install",
      "/welcome/loft",
    ]);
  });

  it("numbers each step and points to the next one", () => {
    expect(welcomeStep("/welcome/bird")).toEqual({
      number: 1,
      total: 3,
      next: "/welcome/install",
    });
    expect(welcomeStep("/welcome/install")).toEqual({
      number: 2,
      total: 3,
      next: "/welcome/loft",
    });
    expect(welcomeStep("/welcome/loft")).toEqual({
      number: 3,
      total: 3,
      next: null,
    });
  });
});
