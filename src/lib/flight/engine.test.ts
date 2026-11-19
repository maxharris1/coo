import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import * as E from "./engine";

type Vector = {
  name: string;
  input: E.FlightInput;
  plan: E.FlightPlan;
  samples: {
    atMs: number;
    lat: number;
    lon: number;
    frac: number;
    state: E.BirdPosition["state"];
  }[];
};

type Vectors = {
  vectors: Vector[];
  sun: { atMs: number; place: E.LatLon; sunriseMs: number; sunsetMs: number }[];
  searchParty: { flightId: string; nowMs: number; result: number | null }[];
  hazards: {
    atMs: number;
    from: E.LatLon;
    to: E.LatLon;
    localWeekend: boolean;
    result: { hawk: boolean; fair: boolean };
  }[];
};

const root = fileURLToPath(new URL("../../..", import.meta.url));
const referenceDir = join(root, "reference", "flight-engine");
const data = JSON.parse(
  readFileSync(join(referenceDir, "vectors.json"), "utf8"),
) as Vectors;

const near = (a: number, b: number, eps = 1e-6) =>
  expect(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`).toBe(
    true,
  );

describe("flight engine vectors", () => {
  for (const v of data.vectors) {
    it(`plan: ${v.name}`, () => {
      const plan = E.computeFlightPlan(v.input);
      near(plan.distanceMi, v.plan.distanceMi);
      near(plan.bearingDeg, v.plan.bearingDeg);
      expect(plan.onTimeOdds).toBe(v.plan.onTimeOdds);
      expect(plan.delayed).toBe(v.plan.delayed);
      expect(plan.delayKind).toBe(v.plan.delayKind);
      expect(plan.arriveAtMs).toBe(v.plan.arriveAtMs);
      expect(plan.segments.length).toBe(v.plan.segments.length);
      plan.segments.forEach((s, i) => {
        const x = v.plan.segments[i];
        expect(s.kind).toBe(x.kind);
        expect(s.startMs).toBe(x.startMs);
        expect(s.endMs).toBe(x.endMs);
        near(s.fromFrac, x.fromFrac, 1e-9);
        near(s.toFrac, x.toFrac, 1e-9);
      });
      expect(plan.events).toEqual(v.plan.events);
      for (const s of v.samples) {
        const p = E.positionAt(plan, v.input.from, v.input.to, s.atMs);
        expect(p.state).toBe(s.state);
        near(p.frac, s.frac, 1e-9);
        near(p.lat, s.lat);
        near(p.lon, s.lon);
      }
    });
  }

  it("plans are well formed", () => {
    for (const v of data.vectors) {
      const plan = E.computeFlightPlan(v.input);
      let t = v.input.departAtMs;
      let frac = 0;
      for (const s of plan.segments) {
        expect(s.startMs, `${v.name}: segments must be contiguous`).toBe(t);
        expect(s.endMs >= s.startMs).toBe(true);
        near(s.fromFrac, frac, 1e-12);
        expect(s.toFrac >= s.fromFrac).toBe(true);
        if (s.kind !== "fly") {
          expect(s.toFrac, `${v.name}: only flying moves the bird`).toBe(
            s.fromFrac,
          );
        }
        t = s.endMs;
        frac = s.toFrac;
      }
      expect(t).toBe(plan.arriveAtMs);
      near(frac, 1, 1e-12);
      expect(
        plan.onTimeOdds >= E.CONFIG.oddsMin &&
          plan.onTimeOdds <= E.CONFIG.oddsMax,
      ).toBe(true);
    }
  });

  it("same input, same plan", () => {
    const v = data.vectors[0];
    expect(E.computeFlightPlan(v.input)).toEqual(
      E.computeFlightPlan(structuredClone(v.input)),
    );
  });

  it("birds do not fly in the dark", () => {
    for (const v of data.vectors) {
      const plan = E.computeFlightPlan(v.input);
      const limit =
        v.input.bird.breed === "king"
          ? E.CONFIG.kingSunAltitudeDeg
          : E.CONFIG.sunAltitudeDeg;
      for (const s of plan.segments) {
        if (s.kind !== "fly" || s.endMs - s.startMs < 3 * 60_000) continue;
        const mid = (s.startMs + s.endMs) / 2;
        const p = E.positionAt(plan, v.input.from, v.input.to, mid);
        expect(
          E.sunAltitudeDeg(mid, p) > limit,
          `${v.name}: flying at night`,
        ).toBe(true);
      }
    }
  });

  it("sun times", () => {
    for (const s of data.sun) {
      const r = E.sunTimes(s.atMs, s.place);
      expect(r.sunriseMs).toBe(s.sunriseMs);
      expect(r.sunsetMs).toBe(s.sunsetMs);
    }
  });

  it("search party", () => {
    for (const s of data.searchParty) {
      expect(E.searchParty(s.flightId, s.nowMs)).toBe(s.result);
    }
  });

  it("hazards", () => {
    for (const h of data.hazards) {
      expect(E.hazardsFor(h.atMs, h.from, h.to, h.localWeekend)).toEqual(
        h.result,
      );
    }
  });

  it("roughly the promised share of flights are delayed", () => {
    const v = data.vectors.find((x) => x.name === "lucky-band");
    if (!v) throw new Error("vectors.json has no lucky-band vector");
    let delayed = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      if (E.computeFlightPlan({ ...v.input, flightId: "stat-" + i }).delayed) {
        delayed++;
      }
    }
    near(delayed / n, 1 - 0.94, 0.015);
  });
});

describe("flight engine config", () => {
  it("config/game.json engine matches the engine's CONFIG", () => {
    expect(config.game.engine).toEqual(E.CONFIG);
  });
});

describe("flight engine source", () => {
  it("is the reference engine, unchanged and import-free", () => {
    const reference = readFileSync(
      join(referenceDir, "flightEngine.ts"),
      "utf8",
    ).replace(/\r/g, "");
    const engine = readFileSync(
      join(root, "src", "lib", "flight", "engine.ts"),
      "utf8",
    ).replace(/\r/g, "");
    expect(engine).toBe(reference);
    expect(engine).not.toMatch(/^\s*import\b/m);
    expect(engine).not.toMatch(/\brequire\(/);
    expect(engine).not.toMatch(/\bimport\(/);
  });
});
