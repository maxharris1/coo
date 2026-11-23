import { describe, expect, it } from "vitest";
import { canvasFor, chromeFor, topFor } from "./shell";

describe("topFor", () => {
  it.each([
    ["/", "sky"],
    ["/shop", "tomato"],
    ["/sill/v1", "sky"],
    ["/send/takeoff/f1", "sky"],
    ["/sill/v1/takeoff", "sky"],
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

describe("canvasFor", () => {
  it.each([
    ["/welcome", "sun"],
    ["/welcome/bird", "sun"],
    ["/welcome/loft", "sun"],
    ["/sign-in", "sun"],
    ["/sign-in/verify", "sun"],
    ["/join/priya-AbCd", "sun"],
    ["/offline", "sun"],
    ["/terms", "sun"],
    ["/privacy", "sun"],
    ["/welcome/install", "sky"],
  ])("fills the canvas behind %s with %s", (path, canvas) => {
    expect(canvasFor(path)).toBe(canvas);
  });

  it.each([
    "/",
    "/shop",
    "/sill/v1",
    "/sill/v1/takeoff",
    "/send/takeoff/f1",
    "/birds/b1",
    "/flights/f1",
    "/b/x",
    "/settings",
    "/flights",
    "/flights/f1/incident",
    "/birds/b1/closet",
    "/sill",
    "/sill/v1/reply",
    "/send/write",
    "/shop/extra",
    "/more",
  ])("keeps the canvas behind %s paper", (path) => {
    expect(canvasFor(path)).toBe("paper");
  });
});

describe("chromeFor", () => {
  it("gives the Report a bug screen the full-screen chrome", () => {
    expect(chromeFor("/more/report-bug")).toBe("full");
  });

  it("keeps the tab bar on /more itself", () => {
    expect(chromeFor("/more")).toBe("tabs");
  });
});
