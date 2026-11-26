import { describe, expect, it } from "vitest";
import { loftTime, type LoftTime } from "./loftTime";

const LOFT = { lat: 40.73, lon: -73.9875 };
const ZONE = "America/New_York";

describe("loftTime with a loft", () => {
  it.each<[number, LoftTime]>([
    [1795078800000, "night"],
    [1795087500000, "dusk"],
    [1795089300000, "sunrise"],
    [1795090200000, "sunrise"],
    [1795100400000, "day"],
    [1795107600000, "day"],
    [1795122600000, "sunset"],
    [1795123800000, "sunset"],
    [1795125000000, "dusk"],
    [1795126200000, "night"],
    [1795131000000, "night"],
  ])("%i is %s", (nowMs, look) => {
    expect(loftTime(nowMs, LOFT, ZONE)).toBe(look);
  });
});

describe("loftTime with no loft", () => {
  const estOn25Nov = (hour: number, minute: number) =>
    Date.UTC(2026, 10, 25, hour + 5, minute);

  it.each<[string, LoftTime, number]>([
    ["21:59", "day", estOn25Nov(21, 59)],
    ["22:00", "night", estOn25Nov(22, 0)],
    ["04:59", "night", estOn25Nov(4, 59)],
    ["05:00", "day", estOn25Nov(5, 0)],
  ])("%s in New York is %s", (_, look, nowMs) => {
    expect(loftTime(nowMs, null, ZONE)).toBe(look);
  });

  it("reads the hour in the user's zone, not UTC", () => {
    const tokyoNoon = Date.UTC(2026, 10, 25, 3, 0);
    expect(loftTime(tokyoNoon, null, "Asia/Tokyo")).toBe("day");
    expect(loftTime(tokyoNoon, null, ZONE)).toBe("night");
  });
});
