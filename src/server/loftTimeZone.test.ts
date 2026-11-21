import { describe, expect, it } from "vitest";
import { loftTimeZone } from "./loftTimeZone";

describe("loft time zone", () => {
  it("picks the time zone whose boundary contains the loft", () => {
    expect(loftTimeZone({ lat: 40.73, lon: -73.9875 })).toBe(
      "America/New_York",
    );
    expect(loftTimeZone({ lat: -13.83, lon: -171.76 })).toBe("Pacific/Apia");
  });

  it("resolves lofts on either side of the antimeridian", () => {
    expect(loftTimeZone({ lat: -16.85, lon: -179.9 })).toBe("Pacific/Fiji");
  });

  it("picks the loft's own zone where a nearer zone city is in another", () => {
    expect(loftTimeZone({ lat: 48.39, lon: -4.49 })).toBe("Europe/Paris");
    expect(loftTimeZone({ lat: 34.95, lon: -85.71 })).toBe("America/Chicago");
    expect(loftTimeZone({ lat: 35.05, lon: -85.31 })).toBe("America/New_York");
  });
});
