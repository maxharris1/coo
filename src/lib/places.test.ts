import { describe, expect, it } from "vitest";
import { cityLabel, roostLabel } from "./places";

describe("roostLabel", () => {
  it("prefers the neighbourhood, then the suburb, then the city", () => {
    expect(
      roostLabel({
        neighbourhood: "Williamsburg",
        suburb: "Brooklyn",
        city: "New York",
      }),
    ).toBe("Williamsburg");
    expect(roostLabel({ suburb: "Brooklyn", city: "New York" })).toBe(
      "Brooklyn",
    );
    expect(roostLabel({ city: "Boston" })).toBe("Boston");
    expect(roostLabel({})).toBeNull();
  });
});

describe("cityLabel", () => {
  it("writes 'City, ST' in the US", () => {
    expect(
      cityLabel({
        city: "New York",
        state: "New York",
        stateCode: "NY",
        countryCode: "US",
        country: "United States",
      }),
    ).toBe("New York, NY");
  });

  it("writes 'City, Country' elsewhere", () => {
    expect(
      cityLabel({
        city: "Lyon",
        state: "Auvergne-Rhône-Alpes",
        countryCode: "FR",
        country: "France",
      }),
    ).toBe("Lyon, France");
  });

  it("falls back to the city alone, and to null with no city", () => {
    expect(cityLabel({ city: "Lyon" })).toBe("Lyon");
    expect(
      cityLabel({ neighbourhood: "Somewhere", country: "France" }),
    ).toBeNull();
  });
});
