import { weekStart, type LocalDate } from "@/lib/game/time";
import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { foundObjects, type FoundItem } from "./jobs/found";
import { jobOffers, type JobOffers } from "./jobs/offers";

export type Earn = {
  seeds: number;
  punchCard: {
    weekStart: LocalDate;
    deliveries: number;
    size: number;
    pay: number;
    paid: boolean;
  };
  payTable: {
    delivery: {
      base: number;
      milesPerBonusSeed: number;
      fullPayPerDay: number;
      reducedPay: number;
    };
    replyHome: number;
    newCity: number;
    partyHatWeekend: number | null;
  };
  jobs: JobOffers;
  found: FoundItem[];
};

export async function earn(deps: Deps, caller: OnboardedCaller): Promise<Earn> {
  const { userId, profile } = caller;
  const seeds = deps.config.game.seeds;
  const week = weekStart(deps.clock.now(), profile.timezone);
  const [[card], [party], jobs, found] = await Promise.all([
    deps.db.query<{ deliveries: number; paid: boolean }>(
      "select deliveries, paid from punch_cards where user_id = $1 and week_start = $2",
      [userId, week],
    ),
    deps.db.query<{ owned: boolean }>(
      "select exists (select 1 from gear_owned where user_id = $1 and gear_id = 'party') as owned",
      [userId],
    ),
    jobOffers(deps, caller),
    foundObjects(deps, caller),
  ]);
  return {
    seeds: profile.seeds,
    punchCard: {
      weekStart: week,
      deliveries: card?.deliveries ?? 0,
      size: seeds.punchCardSize,
      pay: seeds.punchCardPay,
      paid: card?.paid ?? false,
    },
    payTable: {
      delivery: {
        base: seeds.deliveryBase,
        milesPerBonusSeed: seeds.milesPerBonusSeed,
        fullPayPerDay: seeds.fullPayDeliveriesPerDay,
        reducedPay: seeds.reducedDeliveryPay,
      },
      replyHome: seeds.replyHome,
      newCity: seeds.newCity,
      partyHatWeekend: party.owned ? seeds.partyHatWeekendBonus : null,
    },
    jobs,
    found,
  };
}
