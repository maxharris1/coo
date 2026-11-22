import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { haversineMi } from "@/lib/flight/engine";
import { jobDestination, oneWayMiles } from "@/lib/game/jobDest";
import { snap } from "@/lib/game/privacy";

const ids = Array.from(
  { length: 200 },
  (_, n) => `00000000-0000-4000-a000-${String(n + 1).padStart(12, "0")}`,
);
const roosts = [
  snap(40.7128, -74.006),
  snap(64.1466, -21.9426),
  snap(-33.8688, 151.2093),
  snap(10.5, 179.999),
];

describe("oneWayMiles", () => {
  it("is the calm-air speed times half the job's minutes", () => {
    expect(oneWayMiles(45, 1, 10)).toBeCloseTo(3.75, 10);
    expect(oneWayMiles(45, 1, 45)).toBeCloseTo(16.875, 10);
  });

  it("adds the level speed bonus per level above 1", () => {
    const bonus = config.game.engine.levelSpeedBonus;
    expect(oneWayMiles(45, 11, 10)).toBeCloseTo(3.75 * (1 + bonus * 10), 10);
  });
});

describe("jobDestination", () => {
  it("lands within 0.15 mi of the one-way distance from the roost for every job length", () => {
    for (const roost of roosts) {
      for (const [n, id] of ids.entries()) {
        const job = config.jobs.jobs[n % config.jobs.jobs.length];
        const miles = oneWayMiles(20 + (n % 61), 1 + (n % 20), job.minutes);
        const dest = jobDestination(id, roost, miles, job.short);
        expect(
          Math.abs(haversineMi(roost, dest) - miles),
          `${id} from ${roost.lat},${roost.lon}`,
        ).toBeLessThanOrEqual(0.15);
        expect(dest.lon).toBeGreaterThanOrEqual(-180);
        expect(dest.lon).toBeLessThanOrEqual(180);
      }
    }
  });

  it("gives the same snapped point for the same job id, and spreads ids over many bearings", () => {
    const [roost] = roosts;
    const dests = ids.map((id) => jobDestination(id, roost, 10, "odd job"));
    expect(ids.map((id) => jobDestination(id, roost, 10, "odd job"))).toEqual(
      dests,
    );
    for (const dest of dests) {
      expect({ lat: dest.lat, lon: dest.lon }).toEqual(
        snap(dest.lat, dest.lon),
      );
    }
    const quadrants = new Set(
      dests.map(
        (d) =>
          `${Math.sign(d.lat - roost.lat)}:${Math.sign(d.lon - roost.lon)}`,
      ),
    );
    expect(quadrants.size).toBeGreaterThanOrEqual(4);
  });

  it("carries the label it is given", () => {
    expect(
      jobDestination(ids[0], roosts[0], 5, "odd job for the deli"),
    ).toMatchObject({
      label: "odd job for the deli",
    });
  });

  it("never returns the roost itself, even for a distance under one grid cell", () => {
    for (const roost of roosts) {
      for (const id of ids) {
        const dest = jobDestination(id, roost, 0.01, "odd job");
        expect({ lat: dest.lat, lon: dest.lon }).not.toEqual(roost);
      }
    }
  });
});
