import { describe, expect, it } from "vitest";
import {
  activeLoft,
  endpointFor,
  snap,
  type Loft,
  type LoftProfile,
} from "@/lib/game/privacy";

const home: Loft = {
  roost: { lat: 40.714, lon: -73.9625 },
  cityCentre: { lat: 40.7128, lon: -74.006 },
};
const travel: Loft = {
  roost: { lat: 51.508, lon: -0.1275 },
  cityCentre: { lat: 51.5074, lon: -0.1278 },
};

describe("snap", () => {
  it("snaps to the roost grid", () => {
    expect(snap(40.71427, -73.96143)).toEqual({ lat: 40.714, lon: -73.9625 });
  });

  it("leaves a snapped point unchanged", () => {
    expect(snap(40.714, -73.9625)).toEqual({ lat: 40.714, lon: -73.9625 });
  });

  it("never returns negative zero", () => {
    const p = snap(-0.0001, -0.0001);
    expect(Object.is(p.lat, 0)).toBe(true);
    expect(Object.is(p.lon, 0)).toBe(true);
  });
});

describe("activeLoft", () => {
  it("uses travel when the switch is on and travel is set", () => {
    expect(activeLoft({ travelOn: true, home, travel })).toBe(travel);
  });

  it("falls back to home when travel is on but unset", () => {
    expect(activeLoft({ travelOn: true, home, travel: null })).toBe(home);
  });

  it("uses home when the switch is off", () => {
    expect(activeLoft({ travelOn: false, home, travel })).toBe(home);
  });

  it("is null when nothing is set", () => {
    expect(activeLoft({ travelOn: true, home: null, travel: null })).toBeNull();
  });
});

describe("endpointFor", () => {
  const profile: LoftProfile = { travelOn: false, home, travel };

  it("shows the roost to block viewers", () => {
    expect(endpointFor("block", profile)).toEqual(home.roost);
  });

  it("shows the city centre to city viewers", () => {
    expect(endpointFor("city", profile)).toEqual(home.cityCentre);
  });

  it("never falls back to the roost when the city centre is missing", () => {
    const noCity = { ...profile, home: { ...home, cityCentre: null } };
    expect(endpointFor("city", noCity)).toBeNull();
  });

  it("is null with no loft", () => {
    const none = { travelOn: false, home: null, travel: null };
    expect(endpointFor("block", none)).toBeNull();
    expect(endpointFor("city", none)).toBeNull();
  });
});

describe("determinism", () => {
  it("returns equal results for equal inputs", () => {
    const profile: LoftProfile = { travelOn: true, home, travel };
    const run = () => ({
      snap: snap(40.71427, -73.96143),
      loft: activeLoft(profile),
      block: endpointFor("block", profile),
      city: endpointFor("city", profile),
    });
    expect(run()).toEqual(run());
  });
});
