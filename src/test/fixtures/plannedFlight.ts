import { config } from "@/lib/config";
import {
  computeFlightPlan,
  type FlightInput,
  type FlightPlan,
} from "@/lib/flight/engine";
import type { Db } from "@/server/db";
import type { World } from "../seedWorld";
import { insertFlyingDelivery, type DeliveryOpts } from "./flights";

export type PlannedDelivery = {
  flightId: string;
  noteId: string;
  birdId: string;
  arriveAtMs: number;
  distanceMi: number;
  delayKind: FlightPlan["delayKind"];
};

export async function insertPlannedDelivery(
  db: Db,
  world: World,
  nowMs: number,
  opts: DeliveryOpts & {
    dest?: { city: string; region: string; country: string } | null;
  } = {},
): Promise<PlannedDelivery> {
  const { flightId, noteId, birdId } = await insertFlyingDelivery(
    db,
    world,
    nowMs,
    opts,
  );
  const [f] = await db.query<{
    from_lat: number;
    from_lon: number;
    to_lat: number;
    to_lon: number;
    speed_mph: number;
    focus: number;
    navigation: number;
    breed: string;
    gear: string[];
  }>(
    `select f.from_lat, f.from_lon, f.to_lat, f.to_lon,
       b.speed_mph, b.focus, b.navigation, b.breed, b.gear
     from flights f join birds b on b.id = f.bird_id where f.id = $1`,
    [flightId],
  );
  const sample = config.game.weather.fallback;
  const input: FlightInput = {
    flightId,
    from: { lat: f.from_lat, lon: f.from_lon },
    to: { lat: f.to_lat, lon: f.to_lon },
    departAtMs: nowMs,
    bird: {
      speedMph: Number(f.speed_mph),
      focus: f.focus,
      navigation: f.navigation,
      breed: f.breed,
      level: 1,
      belly: 80,
      feathers: 80,
      energy: 100,
      sulking: false,
    },
    gear: f.gear,
    weather: [sample, sample, sample],
  };
  const plan = computeFlightPlan(input);
  const dest =
    opts.dest === undefined
      ? { city: "Philadelphia", region: "Pennsylvania", country: "US" }
      : opts.dest;
  await db.query(
    `update flights set arrive_at = $2, distance_mi = $3, odds = $4, delay_kind = $5,
       input = $6, plan = $7, place_names = $8
     where id = $1`,
    [
      flightId,
      new Date(plan.arriveAtMs).toISOString(),
      plan.distanceMi,
      plan.onTimeOdds,
      plan.delayKind,
      JSON.stringify(input),
      JSON.stringify(plan),
      JSON.stringify(dest ? { dest } : {}),
    ],
  );
  return {
    flightId,
    noteId,
    birdId,
    arriveAtMs: plan.arriveAtMs,
    distanceMi: plan.distanceMi,
    delayKind: plan.delayKind,
  };
}
