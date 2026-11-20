import { config } from "@/lib/config";
import type { BreedId, GearId } from "@/lib/game/types";

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Wearer = { breed: BreedId; gear: readonly GearId[] };

export type JobPay =
  { ok: true; seeds: number } | { ok: false; reason: "daily_cap" };

const seeds = config.game.seeds;
const jobs = config.game.jobs;
const weekend: ReadonlySet<IsoWeekday> = new Set<IsoWeekday>([6, 7]);

export function deliveryPay(
  distanceMi: number,
  deliveriesPaidToday: number,
  opts: { partyHat: boolean; landedLocalWeekday: IsoWeekday },
): number {
  const base =
    deliveriesPaidToday < seeds.fullPayDeliveriesPerDay
      ? seeds.deliveryBase +
        Math.floor(Math.max(0, distanceMi) / seeds.milesPerBonusSeed)
      : seeds.reducedDeliveryPay;
  const party = opts.partyHat && weekend.has(opts.landedLocalWeekday);
  return base + (party ? seeds.partyHatWeekendBonus : 0);
}

export function tipFor(bird: Wearer): number {
  const tip = seeds.tip + (bird.gear.includes("bow") ? seeds.bowTipBonus : 0);
  return tip * (bird.breed === "fantail" ? seeds.fantailTipMultiplier : 1);
}

export function jobPay(job: { pay: number }, jobsDoneToday: number): JobPay {
  if (jobsDoneToday < jobs.fullPayPerDay) return { ok: true, seeds: job.pay };
  if (jobsDoneToday < jobs.maxPerDay) {
    return { ok: true, seeds: Math.floor(job.pay * jobs.reducedPayFactor) };
  }
  return { ok: false, reason: "daily_cap" };
}
