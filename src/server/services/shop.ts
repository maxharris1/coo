import { config } from "@/lib/config";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import {
  bathDone,
  napDone,
  projectCare,
  settleFlight,
  type CareSnapshot,
} from "@/lib/game/care";
import type { BirdStatus, GearId } from "@/lib/game/types";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import {
  toBirdRecord,
  toMe,
  type BirdRecord,
  type Me,
  type Row,
} from "@/server/rows";

type Purchase =
  | { kind: "gear"; id: GearId; price: number }
  | { kind: "birdbath"; price: number }
  | { kind: "perch"; price: number };

type Owner = {
  seeds: number;
  hasBirdbath: boolean;
  perches: number;
  closet: readonly string[];
};

const GEAR = new Map(config.gear.items.map((item) => [item.id, item]));
const BIRDBATH = config.game.loftItems.find((item) => item.id === "birdbath");
const PERCHES = config.game.perches;
const PERCH_PRICES: Partial<Record<string, number>> = PERCHES.prices;

function resolvePurchase(itemId: string, owner: Owner): Purchase {
  const purchase = choose(itemId, owner);
  if (owner.seeds < purchase.price) {
    throw new AppError("insufficient_seeds", "Not enough seeds for that.");
  }
  return purchase;
}

function choose(itemId: string, owner: Owner): Purchase {
  if (itemId === "perch") {
    const price =
      owner.perches < PERCHES.max
        ? PERCH_PRICES[String(owner.perches + 1)]
        : undefined;
    if (price === undefined) {
      throw new AppError("conflict", "The loft has no room for another perch.");
    }
    return { kind: "perch", price };
  }
  if (itemId === "birdbath" && BIRDBATH) {
    if (owner.hasBirdbath) {
      throw new AppError("conflict", "The loft already has a birdbath.");
    }
    return { kind: "birdbath", price: BIRDBATH.price };
  }
  const gear = GEAR.get(itemId);
  if (!gear) throw new AppError("invalid", "itemId: not in the shop");
  if (!gear.available) throw new AppError("conflict", "That is not for sale.");
  if (owner.closet.includes(gear.id)) {
    throw new AppError("conflict", "That is already in the closet.");
  }
  return { kind: "gear", id: gear.id as GearId, price: gear.price };
}

type FlightKind = "delivery" | "return";

type DueFlight = {
  bird_id: string;
  kind: FlightKind;
  input: FlightInput;
  plan: FlightPlan;
};

const statusAfterLanding: Record<FlightKind, BirdStatus> = {
  delivery: "visiting",
  return: "home",
};

const NO_BIRDBATH = { hasBirdbath: false };
const wakeEffect: Partial<Record<string, typeof bathDone>> = {
  bath: bathDone,
  nap: napDone,
};

function careBeforeBirdbath(
  bird: BirdRecord,
  flight: DueFlight | undefined,
  nowMs: number,
): { care: CareSnapshot; woke: boolean } {
  let care: CareSnapshot = {
    belly: bird.belly,
    feathers: bird.feathers,
    energy: bird.energy,
    careAtMs: bird.careAt,
    lastFedAtMs: bird.lastFedAt,
    hungryNotified: bird.hungryNotified,
    status: bird.status,
  };
  const wake = bird.busyKind ? wakeEffect[bird.busyKind] : undefined;
  const wakeAt = bird.busyUntil;
  const woke = wake !== undefined && wakeAt !== null && wakeAt <= nowMs;
  if (woke) care = { ...wake(care, wakeAt, NO_BIRDBATH), status: "home" };
  if (flight)
    care = {
      ...settleFlight(care, flight.plan, flight.input, NO_BIRDBATH),
      status: statusAfterLanding[flight.kind],
    };
  return { care: projectCare(care, nowMs, NO_BIRDBATH), woke };
}

async function settleCareWithoutBirdbath(db: Db, owner: UserId, nowMs: number) {
  const birds = await db.query<Row<"birds">>(
    "select * from birds where owner_id = $1 for update",
    [owner],
  );
  const due = await db.query<DueFlight>(
    `select bird_id, kind, input, plan from flights
     where owner_id = $1 and status = 'flying' and arrive_at <= to_timestamp($2 / 1000.0)`,
    [owner, nowMs],
  );
  const flightOf = new Map(due.map((f) => [f.bird_id, f]));
  for (const row of birds) {
    const bird = toBirdRecord(row);
    const { care, woke } = careBeforeBirdbath(
      bird,
      flightOf.get(bird.id),
      nowMs,
    );
    await db.query(
      `update birds set belly = $2, feathers = $3, energy = $4, care_at = to_timestamp($5 / 1000.0),
         status = case when $6 then 'home' else status end,
         busy_kind = case when $6 then null else busy_kind end,
         busy_until = case when $6 then null else busy_until end
       where id = $1`,
      [bird.id, care.belly, care.feathers, care.energy, care.careAtMs, woke],
    );
  }
}

async function closetOf(db: Db, user: UserId): Promise<GearId[]> {
  const rows = await db.query<{ gear_id: GearId }>(
    "select gear_id from gear_owned where user_id = $1 order by acquired_at, gear_id",
    [user],
  );
  return rows.map((r) => r.gear_id);
}

export async function buy(
  deps: Deps,
  caller: UserId,
  input: { itemId: string },
): Promise<{ me: Me; closet: GearId[] }> {
  const now = deps.clock.now();
  return deps.db.tx(async (db) => {
    const [profile] = await db.query<Profile>(
      "select * from profiles where id = $1 for update",
      [caller],
    );
    if (!profile) throw new AppError("not_found", "No such account.");
    const purchase = resolvePurchase(input.itemId, {
      seeds: profile.seeds,
      hasBirdbath: profile.has_birdbath,
      perches: profile.perches,
      closet: await closetOf(db, caller),
    });
    switch (purchase.kind) {
      case "gear":
        await db.query(
          "insert into gear_owned (user_id, gear_id, acquired_at) values ($1, $2, to_timestamp($3 / 1000.0))",
          [caller, purchase.id, now],
        );
        break;
      case "birdbath":
        await settleCareWithoutBirdbath(db, caller, now);
        await db.query(
          "update profiles set has_birdbath = true where id = $1",
          [caller],
        );
        break;
      case "perch":
        await db.query(
          "update profiles set perches = perches + 1 where id = $1",
          [caller],
        );
        break;
    }
    await db.query("select apply_seeds($1, $2, 'shop', null)", [
      caller,
      -purchase.price,
    ]);
    const [updated] = await db.query<Profile>(
      "select * from profiles where id = $1",
      [caller],
    );
    return { me: toMe(updated), closet: await closetOf(db, caller) };
  });
}

type GearItem = Deps["config"]["gear"]["items"][number];
type LoftItem = Deps["config"]["game"]["loftItems"][number];
type Perches = Deps["config"]["game"]["perches"];

type ShopGear = Pick<GearItem, "id" | "name" | "slot" | "price" | "effect"> & {
  forSale: boolean;
  owned: boolean;
  affordable: boolean;
};
type ShopLoftItem = Pick<LoftItem, "id" | "name" | "effect" | "price"> & {
  owned: boolean;
  affordable: boolean;
};
type NextPerch = {
  number: number;
  price: number;
  toGo: number;
  affordable: boolean;
};
export type Shop = {
  seeds: number;
  gear: ShopGear[];
  loftItems: ShopLoftItem[];
  nextPerch: NextPerch | null;
};

const loftOwned: Partial<Record<string, (profile: Profile) => boolean>> = {
  birdbath: (profile) => profile.has_birdbath,
};

function shopGear(
  item: GearItem,
  seeds: number,
  closet: readonly string[],
): ShopGear {
  const { id, name, slot, price, effect, available } = item;
  return {
    id,
    name,
    slot,
    price,
    effect,
    forSale: available,
    owned: closet.includes(id),
    affordable: available && seeds >= price,
  };
}

function shopLoftItem(item: LoftItem, profile: Profile): ShopLoftItem {
  const { id, name, effect, price } = item;
  return {
    id,
    name,
    effect,
    price,
    owned: loftOwned[id]?.(profile) ?? false,
    affordable: profile.seeds >= price,
  };
}

function nextPerch(
  perches: Perches,
  owned: number,
  seeds: number,
): NextPerch | null {
  if (owned >= perches.max) return null;
  const number = owned + 1;
  const prices: Record<string, number> = perches.prices;
  const price = prices[String(number)];
  return {
    number,
    price,
    toGo: Math.max(0, price - seeds),
    affordable: seeds >= price,
  };
}

export async function listShop(
  deps: Deps,
  caller: OnboardedCaller,
): Promise<Shop> {
  const { profile } = caller;
  const { seeds } = profile;
  const closet = await closetOf(deps.db, caller.userId);
  return {
    seeds,
    gear: deps.config.gear.items.map((item) => shopGear(item, seeds, closet)),
    loftItems: deps.config.game.loftItems.map((item) =>
      shopLoftItem(item, profile),
    ),
    nextPerch: nextPerch(deps.config.game.perches, profile.perches, seeds),
  };
}
