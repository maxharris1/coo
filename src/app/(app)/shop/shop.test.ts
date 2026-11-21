import { describe, expect, it, vi } from "vitest";
import type { Shop } from "@/server/services/shop";
import {
  buyItem,
  completeBuy,
  confirmLine,
  loadShop,
  purchase,
  shopRows,
  type BuyRow,
  type Purchase,
  type ShopRow,
} from "./shop";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const gear = (
  id: string,
  name: string,
  price: number,
  extra: Partial<Shop["gear"][number]> = {},
): Shop["gear"][number] => ({
  id,
  name,
  slot: "head",
  price,
  effect: `${name} effect`,
  forSale: true,
  owned: false,
  affordable: true,
  ...extra,
});

const MOCK: Shop = {
  seeds: 240,
  gear: [
    gear("goggles", "Aviator goggles", 120, { owned: true }),
    gear("rainhat", "Rain hat", 120),
    gear("cap", "Captain's cap", 160),
    gear("tube", "Roomy leg tube", 200),
    gear("backpack", "Tiny backpack", 300, {
      forSale: false,
      affordable: false,
    }),
    gear("booties", "Rain booties", 60),
  ],
  loftItems: [
    {
      id: "birdbath",
      name: "Rooftop birdbath",
      effect: "Feathers stay clean twice as long",
      price: 220,
      owned: false,
      affordable: true,
    },
  ],
  nextPerch: { number: 5, price: 400, toGo: 160, affordable: false },
};

const buyable = (rows: ShopRow[]) =>
  rows.flatMap((row) =>
    row.action.kind === "buy" ? [{ ...row, action: row.action }] : [],
  );

describe("shopRows", () => {
  it("turns the mock shop into gear and loft rows", () => {
    const rows = shopRows(MOCK);
    expect(rows.seeds).toBe(240);
    expect(rows.gear).toEqual([
      {
        itemId: "goggles",
        name: "Aviator goggles",
        effect: "Aviator goggles effect",
        action: { kind: "owned", label: "In the closet" },
      },
      {
        itemId: "rainhat",
        name: "Rain hat",
        effect: "Rain hat effect",
        action: { kind: "buy", price: 120 },
      },
      {
        itemId: "cap",
        name: "Captain's cap",
        effect: "Captain's cap effect",
        action: { kind: "buy", price: 160 },
      },
      {
        itemId: "tube",
        name: "Roomy leg tube",
        effect: "Roomy leg tube effect",
        action: { kind: "buy", price: 200 },
      },
      {
        itemId: "booties",
        name: "Rain booties",
        effect: "Rain booties effect",
        action: { kind: "buy", price: 60 },
      },
    ]);
    expect(rows.loft).toEqual([
      {
        itemId: "birdbath",
        name: "Rooftop birdbath",
        effect: "Feathers stay clean twice as long",
        action: { kind: "buy", price: 220 },
      },
      {
        itemId: "perch",
        name: "Fifth perch",
        effect: "Room for one more bird",
        action: { kind: "short", price: 400, toGo: 160 },
      },
    ]);
  });

  it("names the fourth perch by ordinal", () => {
    const rows = shopRows({
      ...MOCK,
      nextPerch: { number: 4, price: 250, toGo: 10, affordable: false },
    });
    expect(rows.loft.at(-1)).toEqual({
      itemId: "perch",
      name: "Fourth perch",
      effect: "Room for one more bird",
      action: { kind: "short", price: 250, toGo: 10 },
    });
  });

  it("offers the perch to buy when it is affordable", () => {
    const rows = shopRows({
      ...MOCK,
      seeds: 500,
      nextPerch: { number: 5, price: 400, toGo: 0, affordable: true },
    });
    expect(rows.loft.at(-1)?.action).toEqual({ kind: "buy", price: 400 });
  });

  it("drops the perch row when the loft is full", () => {
    const rows = shopRows({ ...MOCK, nextPerch: null });
    expect(rows.loft.map((row) => row.itemId)).toEqual(["birdbath"]);
  });

  it("shows how many seeds to go for gear and loft items out of reach", () => {
    const rows = shopRows({
      ...MOCK,
      seeds: 100,
      gear: [gear("tube", "Roomy leg tube", 200, { affordable: false })],
      loftItems: [{ ...MOCK.loftItems[0], affordable: false }],
    });
    expect(rows.gear[0].action).toEqual({
      kind: "short",
      price: 200,
      toGo: 100,
    });
    expect(rows.loft[0].action).toEqual({
      kind: "short",
      price: 220,
      toGo: 120,
    });
  });

  it("puts an owned birdbath in the loft", () => {
    const rows = shopRows({
      ...MOCK,
      loftItems: [{ ...MOCK.loftItems[0], owned: true }],
    });
    expect(rows.loft[0].action).toEqual({
      kind: "owned",
      label: "In the loft",
    });
  });

  it("keeps gear no longer for sale when it is already owned", () => {
    const rows = shopRows({
      ...MOCK,
      gear: [
        gear("backpack", "Tiny backpack", 300, {
          forSale: false,
          owned: true,
          affordable: false,
        }),
      ],
    });
    expect(rows.gear).toEqual([
      {
        itemId: "backpack",
        name: "Tiny backpack",
        effect: "Tiny backpack effect",
        action: { kind: "owned", label: "In the closet" },
      },
    ]);
  });
});

describe("confirmLine", () => {
  it("asks to buy the rain hat for 120 seeds", () => {
    const [rainhat] = buyable(shopRows(MOCK).gear).filter(
      (row) => row.itemId === "rainhat",
    );
    expect(confirmLine(rainhat)).toBe("Buy the rain hat for 120 seeds?");
  });

  it("lowercases every buyable row's name after the", () => {
    const rows = shopRows({
      ...MOCK,
      seeds: 1000,
      nextPerch: { number: 4, price: 250, toGo: 0, affordable: true },
    });
    expect(
      [...buyable(rows.gear), ...buyable(rows.loft)].map(confirmLine),
    ).toEqual([
      "Buy the rain hat for 120 seeds?",
      "Buy the captain's cap for 160 seeds?",
      "Buy the roomy leg tube for 200 seeds?",
      "Buy the rain booties for 60 seeds?",
      "Buy the rooftop birdbath for 220 seeds?",
      "Buy the fourth perch for 250 seeds?",
    ]);
  });
});

describe("loadShop", () => {
  it("returns the shop from GET /api/shop", async () => {
    const fetchImpl = vi.fn(async () => json(200, MOCK));
    await expect(loadShop(fetchImpl)).resolves.toEqual({
      ok: true,
      data: MOCK,
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/shop");
  });

  it("returns the API's message when the request fails", async () => {
    const fetchImpl = async () =>
      json(401, { error: { code: "unauthorized", message: "Sign in first." } });
    await expect(loadShop(fetchImpl)).resolves.toEqual({
      ok: false,
      code: "unauthorized",
      message: "Sign in first.",
    });
  });

  it("returns the unreachable line when the network fails", async () => {
    const fetchImpl = async () => {
      throw new TypeError("offline");
    };
    await expect(loadShop(fetchImpl)).resolves.toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});

describe("buyItem", () => {
  const bought = {
    me: { id: "u1", seeds: 120 },
    closet: ["goggles", "rainhat"],
  };
  const fourthPerch: BuyRow = {
    itemId: "perch",
    name: "Fourth perch",
    effect: "Room for one more bird",
    action: { kind: "buy", price: 250 },
  };

  it("posts the item id and its confirmed price to /api/shop/buy and returns me and the closet", async () => {
    const fetchImpl = vi.fn(async () => json(200, bought));
    await expect(buyItem(fourthPerch, fetchImpl)).resolves.toEqual({
      ok: true,
      data: bought,
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/shop/buy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: "perch", price: 250 }),
    });
  });

  it("returns the API's message and code when the purchase is refused", async () => {
    const fetchImpl = async () =>
      json(409, {
        error: {
          code: "insufficient_seeds",
          message: "Not enough seeds for that.",
        },
      });
    await expect(buyItem(fourthPerch, fetchImpl)).resolves.toEqual({
      ok: false,
      code: "insufficient_seeds",
      message: "Not enough seeds for that.",
    });
  });

  it("returns the unreachable line when the reply is not JSON", async () => {
    const fetchImpl = async () => new Response("<html>", { status: 502 });
    await expect(buyItem(fourthPerch, fetchImpl)).resolves.toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});

const RAIN_HAT: BuyRow = {
  itemId: "rainhat",
  name: "Rain hat",
  effect: "Shrugs off downpours",
  action: { kind: "buy", price: 120 },
};
const CAP: BuyRow = { ...RAIN_HAT, itemId: "cap", name: "Captain's cap" };

describe("purchase (part 4 ac-1)", () => {
  const idle: Purchase = { kind: "idle" };
  const confirming: Purchase = { kind: "confirming", row: RAIN_HAT };
  const buying: Purchase = { kind: "buying", row: RAIN_HAT };

  it("opens the confirm step when a price is tapped", () => {
    expect(purchase(idle, { type: "tap", row: RAIN_HAT })).toEqual(confirming);
  });

  it("keeps one confirm step open when another price is tapped", () => {
    expect(purchase(confirming, { type: "tap", row: CAP })).toEqual(confirming);
    expect(purchase(buying, { type: "tap", row: CAP })).toEqual(buying);
  });

  it("closes without buying on Not now", () => {
    expect(purchase(confirming, { type: "cancel" })).toEqual(idle);
  });

  it("starts the purchase only from the confirm step", () => {
    expect(purchase(confirming, { type: "confirm" })).toEqual(buying);
    expect(purchase(idle, { type: "confirm" })).toEqual(idle);
    expect(purchase(buying, { type: "confirm" })).toEqual(buying);
  });

  it("stays open while the request is in flight", () => {
    expect(purchase(buying, { type: "cancel" })).toEqual(buying);
  });

  it("closes once the request settles", () => {
    expect(purchase(buying, { type: "settled" })).toEqual(idle);
  });
});

describe("completeBuy (part 4 ac-2)", () => {
  const deps = (buyResult: Awaited<ReturnType<typeof buyItem>>) => {
    const calls: string[] = [];
    return {
      calls,
      buy: vi.fn(async (row: BuyRow) => {
        calls.push(`buy ${row.itemId} for ${row.action.price}`);
        return buyResult;
      }),
      load: vi.fn(async (): ReturnType<typeof loadShop> => {
        calls.push("load");
        return { ok: true as const, data: { ...MOCK, seeds: 120 } };
      }),
      toast: vi.fn((message: string) => calls.push(`toast ${message}`)),
      refresh: vi.fn(() => calls.push("refresh")),
      burst: vi.fn((itemId: string) => calls.push(`burst ${itemId}`)),
    };
  };

  const before = shopRows(MOCK);
  const hat: BuyRow = {
    itemId: "rainhat",
    name: "Rain hat",
    effect: "Rain hat effect",
    action: { kind: "buy", price: 120 },
  };

  it("bursts from the item, refreshes sync and refetches the shop", async () => {
    const d = deps({ ok: true, data: { me: {} as never, closet: [] } });
    const rows = await completeBuy(hat, before, d);
    expect(d.calls).toEqual([
      "buy rainhat for 120",
      "burst rainhat",
      "refresh",
      "load",
    ]);
    expect(rows).toEqual(shopRows({ ...MOCK, seeds: 120 }));
  });

  it("toasts the API's message and changes nothing on failure", async () => {
    const d = deps({ ok: false, message: "Not enough seeds for that." });
    const rows = await completeBuy(hat, before, d);
    expect(d.calls).toEqual([
      "buy rainhat for 120",
      "toast Not enough seeds for that.",
    ]);
    expect(rows).toBe(before);
  });

  it("toasts a price change, then shows the shop as it is now", async () => {
    const d = deps({
      ok: false,
      code: "conflict",
      message: "The price changed. Take another look.",
    });
    const rows = await completeBuy(hat, before, d);
    expect(d.calls).toEqual([
      "buy rainhat for 120",
      "toast The price changed. Take another look.",
      "load",
    ]);
    expect(rows).toEqual(shopRows({ ...MOCK, seeds: 120 }));
  });

  it("keeps the rows it had when the refetch after a price change fails", async () => {
    const d = deps({
      ok: false,
      code: "conflict",
      message: "The price changed. Take another look.",
    });
    d.load.mockImplementation(async () => {
      d.calls.push("load");
      return { ok: false, message: "We could not reach the loft. Try again." };
    });
    const rows = await completeBuy(hat, before, d);
    expect(d.calls).toEqual([
      "buy rainhat for 120",
      "toast The price changed. Take another look.",
      "load",
      "toast We could not reach the loft. Try again.",
    ]);
    expect(rows).toBe(before);
  });
});
