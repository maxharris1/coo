import type { GearId } from "@/lib/game/types";
import type { Me } from "@/server/rows";
import type { Shop } from "@/server/services/shop";

export type RowAction =
  | { kind: "owned"; label: "In the closet" | "In the loft" }
  | { kind: "buy"; price: number }
  | { kind: "short"; price: number; toGo: number };

export type ShopRow<A extends RowAction = RowAction> = {
  itemId: string;
  name: string;
  effect: string;
  action: A;
};

export type ShopRows = { seeds: number; gear: ShopRow[]; loft: ShopRow[] };

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

const priced = (price: number, affordable: boolean, toGo: number): RowAction =>
  affordable ? { kind: "buy", price } : { kind: "short", price, toGo };

const row = (
  { id, name, effect, price, owned, affordable }: Item,
  seeds: number,
  label: "In the closet" | "In the loft",
): ShopRow => ({
  itemId: id,
  name,
  effect,
  action: owned
    ? { kind: "owned", label }
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
      .map((item) => row(item, seeds, "In the closet")),
    loft: [
      ...shop.loftItems.map((item) => row(item, seeds, "In the loft")),
      ...perch,
    ],
  };
}

export function confirmLine({
  name,
  action,
}: ShopRow<Extract<RowAction, { kind: "buy" }>>): string {
  return `Buy the ${name.toLowerCase()} for ${action.price} seeds?`;
}

const UNREACHABLE = "We could not reach the loft. Try again.";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
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
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export const loadShop = (fetchImpl: Fetch = fetch) =>
  call<Shop>(fetchImpl, "/api/shop");

export const buyItem = (itemId: string, fetchImpl: Fetch = fetch) =>
  call<{ me: Me; closet: GearId[] }>(fetchImpl, "/api/shop/buy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemId }),
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
