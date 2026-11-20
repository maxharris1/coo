import { config } from "@/lib/config";
import type { FlightInput, FlightPlan, SegmentKind } from "@/lib/flight/engine";
import type { BirdStatus } from "@/lib/game/types";

export type CareSnapshot = {
  belly: number;
  feathers: number;
  energy: number;
  careAtMs: number;
  lastFedAtMs: number;
  hungryNotified: boolean;
  status: BirdStatus;
};

export type CareOwner = { hasBirdbath: boolean };

export type CareReading = {
  belly: number;
  feathers: number;
  energy: number;
  hungry: boolean;
  scruffy: boolean;
  tired: boolean;
  sulking: boolean;
  canFly: boolean;
};

const care = config.game.care;
const HOUR_MS = 3_600_000;

const energyPerHour: Record<BirdStatus, number> = {
  home: care.energyHomePerHour,
  scheduled: care.energyHomePerHour,
  busy: care.energyHomePerHour,
  flying: 0,
  visiting: 0,
};

function clamp(v: number): number {
  return Math.min(care.full, Math.max(0, v));
}

function toScale(v: number): number {
  return Math.round(clamp(v) * 10) / 10;
}

function clamped(bird: CareSnapshot): CareSnapshot {
  return {
    ...bird,
    belly: toScale(bird.belly),
    feathers: toScale(bird.feathers),
    energy: toScale(bird.energy),
  };
}

export function projectCare(
  bird: CareSnapshot,
  atMs: number,
  owner: CareOwner,
): CareSnapshot {
  const hours = Math.max(0, atMs - bird.careAtMs) / HOUR_MS;
  const featherFactor = owner.hasBirdbath ? care.birdbathFeatherFactor : 1;
  return clamped({
    ...bird,
    belly: bird.belly + care.bellyPerHour * hours,
    feathers: bird.feathers + care.feathersPerHour * featherFactor * hours,
    energy: bird.energy + energyPerHour[bird.status] * hours,
    careAtMs: Math.max(bird.careAtMs, atMs),
  });
}

export function careAt(
  bird: CareSnapshot,
  nowMs: number,
  owner: CareOwner,
): CareReading {
  const { belly, feathers, energy } = projectCare(bird, nowMs, owner);
  return {
    belly,
    feathers,
    energy,
    hungry: belly < care.hungryBelow,
    scruffy: feathers < care.dirtyBelow,
    tired: energy < care.tiredBelow,
    sulking: nowMs - bird.lastFedAtMs >= care.sulkAfterHoursUnfed * HOUR_MS,
    canFly: energy >= care.minEnergyToFly,
  };
}

export function feed(
  bird: CareSnapshot,
  atMs: number,
  owner: CareOwner,
): CareSnapshot {
  const now = projectCare(bird, atMs, owner);
  return clamped({
    ...now,
    belly: now.belly + care.feedBelly,
    lastFedAtMs: atMs,
    hungryNotified: false,
  });
}

export function snack(
  bird: CareSnapshot,
  atMs: number,
  owner: CareOwner,
): CareSnapshot {
  const now = projectCare(bird, atMs, owner);
  return clamped({ ...now, belly: now.belly + care.snackBelly });
}

export function bathDone(
  bird: CareSnapshot,
  atMs: number,
  owner: CareOwner,
): CareSnapshot {
  return { ...projectCare(bird, atMs, owner), feathers: care.full };
}

export function napDone(
  bird: CareSnapshot,
  atMs: number,
  owner: CareOwner,
): CareSnapshot {
  const now = projectCare(bird, atMs, owner);
  return clamped({ ...now, energy: now.energy + care.napEnergy });
}

export function settleFlight(
  bird: CareSnapshot,
  plan: FlightPlan,
  input: FlightInput,
  owner: CareOwner,
): CareSnapshot {
  if (bird.careAtMs >= plan.arriveAtMs) return bird;
  const flyPerHour =
    care.energyFlyPerHour *
    (input.bird.breed === "king" ? care.kingEnergyFactor : 1);
  const segmentPerHour: Record<SegmentKind, number> = {
    fly: flyPerHour,
    delay: flyPerHour,
    roost: care.energyRoostPerHour,
  };
  const rained = input.weather.some(
    (w) => w.precipMmH >= config.game.engine.rainMmH,
  );
  const soaked = rained && !input.gear.includes("booties");
  const landed = projectCare(bird, plan.arriveAtMs, owner);
  const energy = plan.segments.reduce(
    (e, s) =>
      clamp(e + segmentPerHour[s.kind] * ((s.endMs - s.startMs) / HOUR_MS)),
    landed.energy,
  );
  return clamped({
    ...landed,
    energy,
    feathers: landed.feathers + (soaked ? care.rainFlightFeathers : 0),
  });
}
