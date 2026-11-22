import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import {
  computeFlightPlan,
  haversineMi,
  positionAt,
} from "@/lib/flight/engine";
import {
  jobDestination,
  jobLegs,
  legAt,
  oneWayMiles,
} from "@/lib/game/jobDest";
import { snap } from "@/lib/game/privacy";

vi.mock("@/lib/flight/engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("@/lib/flight/engine")>();
  return { ...engine, computeFlightPlan: vi.fn(engine.computeFlightPlan) };
});

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

  it("matches the formula docs/03-data-model.md gives for the job destination", () => {
    const doc = readFileSync(
      new URL("../../../docs/03-data-model.md", import.meta.url),
      "utf8",
    ).replace(/\s+/g, " ");
    const formula = doc.match(/one-way distance in miles \(`([^`]+)`\)/)?.[1];
    expect(formula, "documented one-way distance formula").toBeDefined();
    const documented = new Function(
      "speedMph",
      "levelSpeedBonus",
      "level",
      "minutes",
      `return ${formula!.replaceAll("×", "*").replaceAll("−", "-")};`,
    );
    const bonus = config.game.engine.levelSpeedBonus;
    for (const [speed, level, minutes] of [
      [45, 1, 10],
      [30, 7, 45],
      [62, 20, 120],
    ]) {
      expect(documented(speed, bonus, level, minutes)).toBeCloseTo(
        oneWayMiles(speed, level, minutes),
        10,
      );
    }
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

describe("jobLegs and legAt", () => {
  const loft = snap(40.7128, -74.006);
  const dest = jobDestination(ids[0], loft, 3.75, "odd job for the deli");
  const startedAt = Date.UTC(2026, 10, 22, 3, 0, 0);
  const endsAt = startedAt + 10 * 60_000;
  const legs = jobLegs(loft, dest, startedAt, endsAt);
  const { out, back, midMs } = legs;
  const near = (
    p: { lat: number; lon: number },
    q: { lat: number; lon: number },
  ) => {
    expect(p.lat).toBeCloseTo(q.lat, 9);
    expect(p.lon).toBeCloseTo(q.lon, 9);
  };

  it("splits the job at the midpoint of started_at and ends_at", () => {
    expect(midMs).toBe(startedAt + 5 * 60_000);
    expect(out).toMatchObject({ dir: "out", from: loft, to: dest });
    expect(back).toMatchObject({ dir: "back", from: dest, to: loft });
  });

  it("builds each leg as one fly segment with no roost or delay", () => {
    expect(out.plan.segments).toEqual([
      { kind: "fly", startMs: startedAt, endMs: midMs, fromFrac: 0, toFrac: 1 },
    ]);
    expect(back.plan.segments).toEqual([
      { kind: "fly", startMs: midMs, endMs: endsAt, fromFrac: 0, toFrac: 1 },
    ]);
    for (const leg of [out, back]) {
      expect(leg.plan).toMatchObject({ delayed: false, delayKind: "none" });
      expect(leg.plan.distanceMi).toBeCloseTo(haversineMi(loft, dest), 9);
      expect(leg.distanceMi).toBe(leg.plan.distanceMi);
    }
    expect(out.plan.arriveAtMs).toBe(midMs);
    expect(back.plan.arriveAtMs).toBe(endsAt);
  });

  it("never runs the flight engine's plan", () => {
    jobLegs(loft, dest, startedAt, endsAt);
    expect(computeFlightPlan).not.toHaveBeenCalled();
  });

  it("picks the out leg before the midpoint and the back leg from it", () => {
    expect(legAt(legs, startedAt).dir).toBe("out");
    expect(legAt(legs, midMs - 1).dir).toBe("out");
    expect(legAt(legs, midMs).dir).toBe("back");
    expect(legAt(legs, endsAt).dir).toBe("back");
    expect(legAt(legs, endsAt + 60_000).dir).toBe("back");
  });

  it("flies from the loft at started_at", () => {
    const leg = legAt(legs, startedAt);
    const p = positionAt(leg.plan, leg.from, leg.to, startedAt);
    expect(p).toMatchObject({ frac: 0, state: "flying" });
    near(p, loft);
  });

  it("is halfway out at a quarter of the job", () => {
    const at = startedAt + (midMs - startedAt) / 2;
    const leg = legAt(legs, at);
    expect(positionAt(leg.plan, leg.from, leg.to, at)).toMatchObject({
      frac: 0.5,
      state: "flying",
    });
  });

  it("is at the dest just before the midpoint", () => {
    const leg = legAt(legs, midMs - 1);
    const p = positionAt(leg.plan, leg.from, leg.to, midMs - 1);
    expect(p.state).toBe("flying");
    expect(p.frac).toBeGreaterThan(0.999);
    expect(haversineMi(p, dest)).toBeLessThan(0.01);
  });

  it("turns around at the dest at the midpoint, flying, with no waiting gap", () => {
    const leg = legAt(legs, midMs);
    const p = positionAt(leg.plan, leg.from, leg.to, midMs);
    expect(p).toMatchObject({ frac: 0, state: "flying" });
    near(p, dest);
    for (let ms = startedAt; ms < endsAt; ms += 1_000) {
      const l = legAt(legs, ms);
      expect(positionAt(l.plan, l.from, l.to, ms).state).toBe("flying");
    }
  });

  it("is landed at the loft at ends_at and after", () => {
    for (const at of [endsAt, endsAt + 3_600_000]) {
      const leg = legAt(legs, at);
      const p = positionAt(leg.plan, leg.from, leg.to, at);
      expect(p).toMatchObject({ frac: 1, state: "landed" });
      near(p, loft);
    }
  });
});
