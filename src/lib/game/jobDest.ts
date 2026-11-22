import { config } from "@/lib/config";
import {
  bearingDeg,
  hash32,
  haversineMi,
  rng,
  type FlightPlan,
  type LatLon,
} from "@/lib/flight/engine";
import { snap, type Point } from "@/lib/game/privacy";

export type JobDest = Point & { label: string };

const RAD = Math.PI / 180;
const EARTH_MI = 3958.7613;
const CELL_MI = config.game.roost.gridLatDeg * RAD * EARTH_MI;

export function oneWayMiles(
  speedMph: number,
  level: number,
  minutes: number,
): number {
  const calmAir =
    speedMph * (1 + config.game.engine.levelSpeedBonus * (level - 1));
  return (calmAir * (minutes / 2)) / 60;
}

export function destinationAlong(
  from: LatLon,
  bearingDeg: number,
  miles: number,
): LatLon {
  const d = miles / EARTH_MI;
  const b = bearingDeg * RAD;
  const p1 = from.lat * RAD;
  const p2 = Math.asin(
    Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b),
  );
  const l2 =
    from.lon * RAD +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2),
    );
  const lon = ((((l2 / RAD + 180) % 360) + 360) % 360) - 180;
  return { lat: p2 / RAD, lon };
}

function snapped(p: LatLon): Point {
  return snap(p.lat, p.lon);
}

function samePoint(a: Point, b: Point): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}

export function jobDestination(
  jobRowId: string,
  roost: Point,
  miles: number,
  label: string,
): JobDest {
  const bearing = rng(hash32("job-dest:" + jobRowId))() * 360;
  const dest = snapped(destinationAlong(roost, bearing, miles));
  const point = samePoint(dest, roost)
    ? snapped(destinationAlong(roost, bearing, miles + CELL_MI))
    : dest;
  return { ...point, label };
}

export type JobLeg = {
  dir: "out" | "back";
  from: LatLon;
  to: LatLon;
  plan: FlightPlan;
  distanceMi: number;
};

export type JobLegs = { out: JobLeg; back: JobLeg; midMs: number };

function jobLeg(
  dir: JobLeg["dir"],
  from: LatLon,
  to: LatLon,
  startMs: number,
  endMs: number,
): JobLeg {
  const distanceMi = haversineMi(from, to);
  const plan: FlightPlan = {
    distanceMi,
    bearingDeg: bearingDeg(from, to),
    onTimeOdds: 1,
    delayed: false,
    delayKind: "none",
    arriveAtMs: endMs,
    segments: [{ kind: "fly", startMs, endMs, fromFrac: 0, toFrac: 1 }],
    events: [],
  };
  return { dir, from, to, plan, distanceMi };
}

export function jobLegs(
  loft: LatLon,
  dest: LatLon,
  startedAtMs: number,
  endsAtMs: number,
): JobLegs {
  const midMs = startedAtMs + Math.floor((endsAtMs - startedAtMs) / 2);
  return {
    out: jobLeg("out", loft, dest, startedAtMs, midMs),
    back: jobLeg("back", dest, loft, midMs, endsAtMs),
    midMs,
  };
}

export function legAt(legs: JobLegs, nowMs: number): JobLeg {
  return nowMs < legs.midMs ? legs.out : legs.back;
}
