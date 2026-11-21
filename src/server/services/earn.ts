import { weekStart, type LocalDate } from "@/lib/game/time";
import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { foundObjects, type FoundItem } from "./jobs/found";
import { jobOffers, type JobOffers } from "./jobs/offers";

const LANDING_REASONS = ["delivery", "new_city", "punch_card"] as const;
type LandingReason = (typeof LANDING_REASONS)[number];

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
  earned: {
    flightId: string;
    lines: { reason: LandingReason; seeds: number }[];
  } | null;
};

export async function earn(
  deps: Deps,
  caller: OnboardedCaller,
  opts: { flightId?: string },
): Promise<Earn> {
  const { userId, profile } = caller;
  const seeds = deps.config.game.seeds;
  const week = weekStart(deps.clock.now(), profile.timezone);
  const [[card], [party], jobs, found, earned] = await Promise.all([
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
    opts.flightId ? landingEarned(deps, caller, opts.flightId) : null,
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
    earned,
  };
}

async function landingEarned(
  deps: Deps,
  caller: OnboardedCaller,
  flightId: string,
): Promise<NonNullable<Earn["earned"]>> {
  const rows = await deps.db.query<
    { reason: LandingReason; delta: number } | { reason: null; delta: null }
  >(
    `select l.reason, l.delta from flights f
     left join seed_ledger l
       on l.ref_id = f.id and l.user_id = f.owner_id and l.reason = any($3)
     where f.id = $1 and f.owner_id = $2 and f.kind = 'delivery'
     order by array_position($3, l.reason)`,
    [flightId, caller.userId, LANDING_REASONS],
  );
  if (rows.length === 0) throw new AppError("not_found", "No such flight");
  return {
    flightId,
    lines: rows.flatMap(({ reason, delta }) =>
      reason === null ? [] : [{ reason, seeds: delta }],
    ),
  };
}
