import { describe, expect, it } from "vitest";
import { topFor } from "./shell";

describe("topFor", () => {
  it.each([
    ["/", "sky"],
    ["/shop", "tomato"],
    ["/sill/v1", "sky"],
    ["/send/takeoff/f1", "sky"],
    ["/birds/b1", "sky"],
    ["/flights/f1", "map"],
    ["/welcome/install", "sky"],
    ["/welcome", "sun"],
    ["/welcome/bird", "sun"],
    ["/welcome/loft", "sun"],
    ["/sign-in", "sun"],
    ["/sign-in/verify", "sun"],
    ["/join/priya-AbCd", "sun"],
    ["/offline", "sun"],
    ["/terms", "sun"],
    ["/privacy", "sun"],
    ["/b/some-slug", "sky"],
  ])("gives %s the colour of its hero, %s", (path, top) => {
    expect(topFor(path)).toBe(top);
  });

  it.each([
    "/settings",
    "/flights",
    "/flights/f1/incident",
    "/birds/b1/closet",
    "/sill",
    "/sill/v1/reply",
    "/send/write",
    "/shop/extra",
    "/more",
  ])("gives the cream page %s paper", (path) => {
    expect(topFor(path)).toBe("paper");
  });
});
