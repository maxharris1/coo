import type { GearId } from "@/lib/game/types";
import type { Me } from "@/server/rows";
import type { Shop } from "@/server/services/shop";

type OwnedLabel = "Unlocked" | "In the loft" | "On the roof";

export type RowAction =
  | { kind: "owned"; label: OwnedLabel }
  | { kind: "buy"; price: number }
  | { kind: "short"; price: number; toGo: number };

export type ShopRow<A extends RowAction = RowAction> = {
  itemId: string;
  name: string;
  effect: string;
  held?: number;
  action: A;
};

export type ShopRows = { seeds: number; gear: ShopRow[]; loft: ShopRow[] };

export type BuyRow = ShopRow<Extract<RowAction, { kind: "buy" }>>;

export type Purchase =
  | { kind: "idle" }
  | { kind: "confirming"; row: BuyRow }
  | { kind: "buying"; row: BuyRow };

export type PurchaseEvent =
  | { type: "tap"; row: BuyRow }
  | { type: "cancel" }
  | { type: "confirm" }
  | { type: "settled" };

export function purchase(state: Purchase, event: PurchaseEvent): Purchase {
  switch (event.type) {
    case "tap":
      return state.kind === "idle"
        ? { kind: "confirming", row: event.row }
        : state;
    case "cancel":
      return state.kind === "confirming" ? { kind: "idle" } : state;
    case "confirm":
      return state.kind === "confirming"
        ? { kind: "buying", row: state.row }
        : state;
    case "settled":
      return state.kind === "buying" ? { kind: "idle" } : state;
  }
}

const ORDINALS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
];

type Item = {
  id: string;
  name: string;
  effect: string;
  price: number;
  owned: boolean;
  affordable: boolean;
};

const LOFT_LABELS: Partial<Record<string, OwnedLabel>> = {
  birdbath: "In the loft",
};

const gearLabel = (): OwnedLabel => "Unlocked";
const loftLabel = (itemId: string): OwnedLabel =>
  LOFT_LABELS[itemId] ?? "On the roof";

const priced = (price: number, affordable: boolean, toGo: number): RowAction =>
  affordable ? { kind: "buy", price } : { kind: "short", price, toGo };

const row = (
  { id, name, effect, price, owned, affordable }: Item,
  seeds: number,
  label: (itemId: string) => OwnedLabel,
): ShopRow => ({
  itemId: id,
  name,
  effect,
  action: owned
    ? { kind: "owned", label: label(id) }
    : priced(price, affordable, price - seeds),
});

export function shopRows(shop: Shop): ShopRows {
  const { seeds, nextPerch } = shop;
  const perch: ShopRow[] = nextPerch
    ? [
        {
          itemId: "perch",
          name: `${ORDINALS[nextPerch.number - 1]} perch`,
          effect: "Room for one more bird",
          action: priced(nextPerch.price, nextPerch.affordable, nextPerch.toGo),
        },
      ]
    : [];
  return {
    seeds,
    gear: shop.gear
      .filter((item) => item.forSale || item.owned)
      .map((item) => row(item, seeds, gearLabel)),
    loft: [
      ...shop.loftItems.map((item) => row(item, seeds, loftLabel)),
      ...perch,
      ...shop.consumables.map(
        ({ id, name, effect, price, held, affordable }): ShopRow => ({
          itemId: id,
          name,
          effect,
          held,
          action: priced(price, affordable, price - seeds),
        }),
      ),
    ],
  };
}

export function confirmLine({ name, action }: BuyRow): string {
  return `Buy the ${name.toLowerCase()} for ${action.price} seeds?`;
}

const UNREACHABLE = "We could not reach the loft. Try again.";

type Result<T> =
  { ok: true; data: T } | { ok: false; message: string; code?: string };
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function call<T>(
  fetchImpl: Fetch,
  url: string,
  init?: RequestInit,
): Promise<Result<T>> {
  try {
    const res = init ? await fetchImpl(url, init) : await fetchImpl(url);
    const json: unknown = await res.json().catch(() => null);
    if (res.ok && json !== null) return { ok: true, data: json as T };
    const error = (
      json as { error?: { code?: unknown; message?: unknown } } | null
    )?.error;
    const message = error?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
      ...(typeof error?.code === "string" && { code: error.code }),
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export const loadShop = (fetchImpl: Fetch = fetch) =>
  call<Shop>(fetchImpl, "/api/shop");

export const buyItem = ({ itemId, action }: BuyRow, fetchImpl: Fetch = fetch) =>
  call<{ me: Me; closet: GearId[] }>(fetchImpl, "/api/shop/buy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      itemId,
      price: action.price,
      actionId: crypto.randomUUID(),
    }),
  });

export async function openShop(
  load: () => Promise<Result<Shop>>,
  toast: (message: string) => void,
): Promise<ShopRows | null> {
  const result = await load();
  if (result.ok) return shopRows(result.data);
  toast(result.message);
  return null;
}

export function settle(rows: ShopRows, bought: BuyRow): ShopRows {
  const seeds = rows.seeds - bought.action.price;
  const reprice =
    (label: (itemId: string) => OwnedLabel) =>
    (row: ShopRow): ShopRow[] => {
      const isBought = row.itemId === bought.itemId;
      if (isBought && row.held === undefined)
        return row.itemId === "perch"
          ? []
          : [{ ...row, action: { kind: "owned", label: label(row.itemId) } }];
      if (row.action.kind === "owned") return [row];
      const { price } = row.action;
      const repriced = {
        ...row,
        action: priced(price, seeds >= price, price - seeds),
      };
      return [isBought ? { ...repriced, held: (row.held ?? 0) + 1 } : repriced];
    };
  return {
    seeds,
    gear: rows.gear.flatMap(reprice(gearLabel)),
    loft: rows.loft.flatMap(reprice(loftLabel)),
  };
}

export async function completeBuy(
  bought: BuyRow,
  rows: ShopRows,
  deps: {
    buy(row: BuyRow): Promise<Result<unknown>>;
    load(): Promise<Result<Shop>>;
    toast(message: string): void;
    refresh(): void;
    burst(itemId: string): void;
  },
): Promise<ShopRows> {
  const result = await deps.buy(bought);
  if (!result.ok) {
    deps.toast(result.message);
    if (result.code !== "conflict") return rows;
    return (await openShop(deps.load, deps.toast)) ?? rows;
  }
  deps.burst(bought.itemId);
  deps.refresh();
  return (await openShop(deps.load, deps.toast)) ?? settle(rows, bought);
}
