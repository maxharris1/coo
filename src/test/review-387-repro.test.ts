import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeBuy,
  confirmLine,
  shopRows,
  type BuyRow,
  type ShopRows,
} from "@/app/(app)/shop/shop";
import { ShopItems, type SeedBurst } from "@/app/(app)/shop/ShopItems";
import { startSync, type SyncResult } from "@/components/sync";
import { toE164 } from "@/lib/phone";
import { requireOnboarded } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { AppError } from "@/server/errors";
import { buy, listShop, type Shop } from "@/server/services/shop";
import { makeTestDeps, type TestDeps } from "./deps";
import { FakeJar } from "./fakes/jar";
import { seedWorld } from "./seedWorld";

const perchOffer = (rows: ShopRows): BuyRow | undefined => {
  const row = rows.loft.find((r) => r.itemId === "perch");
  return row?.action.kind === "buy"
    ? { ...row, action: row.action }
    : undefined;
};

const noop = () => {};

describe("f-1: a confirmation always names the price the server charges (ac-1)", () => {
  let deps: TestDeps;
  let max: UserId;

  const openShopRows = async () => {
    const phone = toE164("+15550000001");
    if (!phone) throw new Error("synthetic phone invalid");
    const auth = deps.auth(new FakeJar());
    await auth.verifyCode(phone, "000000");
    const caller = await requireOnboarded({ auth, db: deps.db });
    return shopRows(await listShop(deps, caller));
  };

  const charged = async () => {
    const [{ sum }] = await deps.db.query<{ sum: number }>(
      "select coalesce(sum(-delta), 0)::int as sum from seed_ledger where user_id = $1 and reason = 'shop'",
      [max],
    );
    return sum;
  };

  beforeEach(async () => {
    deps = await makeTestDeps();
    const world = await seedWorld(deps.db, deps.clock.now());
    max = world.max.id as UserId;
    await deps.db.query("select apply_seeds($1, 1000, 'test', null)", [max]);
  });

  it("drops the bought perch offer when the shop refetch fails after a successful buy", async () => {
    const rows = await openShopRows();
    const fourth = perchOffer(rows);
    expect(fourth && confirmLine(fourth)).toBe(
      "Buy the fourth perch for 250 seeds?",
    );

    const next = await completeBuy(fourth!, rows, {
      buy: async ({ itemId, action }) => ({
        ok: true,
        data: await buy(deps, max, { itemId, price: action.price }),
      }),
      load: async () => ({
        ok: false,
        message: "We could not reach the loft.",
      }),
      toast: noop,
      refresh: noop,
      burst: noop,
    });

    expect(await charged(), "the fourth perch charged its price").toBe(250);
    expect(next.seeds, "balance reflects the purchase").toBe(rows.seeds - 250);
    const offer = perchOffer(next);
    if (offer) {
      const before = await charged();
      await buy(deps, max, {
        itemId: offer.itemId,
        price: offer.action.price,
      });
      expect(
        (await charged()) - before,
        `charged for "${confirmLine(offer)}"`,
      ).toBe(offer.action.price);
    }
    expect(offer, "no stale perch offer until the shop is current").toBe(
      undefined,
    );
  });

  it("never charges a price different from the confirmation when another tab bought first", async () => {
    const rowsA = await openShopRows();
    const fourthA = perchOffer(rowsA)!;
    expect(confirmLine(fourthA)).toBe("Buy the fourth perch for 250 seeds?");

    const rowsB = await openShopRows();
    const fourthB = perchOffer(rowsB)!;
    await buy(deps, max, {
      itemId: fourthB.itemId,
      price: fourthB.action.price,
    });

    const toasts: string[] = [];
    const next = await completeBuy(fourthA, rowsA, {
      buy: async ({ itemId, action }) => {
        try {
          return {
            ok: true,
            data: await buy(deps, max, { itemId, price: action.price }),
          };
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          return { ok: false, code: err.code, message: err.message };
        }
      },
      load: async () => {
        const phone = toE164("+15550000001")!;
        const auth = deps.auth(new FakeJar());
        await auth.verifyCode(phone, "000000");
        const caller = await requireOnboarded({ auth, db: deps.db });
        return { ok: true, data: await listShop(deps, caller) };
      },
      toast: (message) => toasts.push(message),
      refresh: noop,
      burst: noop,
    });

    expect(await charged(), "only tab B's fourth perch was charged").toBe(250);
    const [{ perches }] = await deps.db.query<{ perches: number }>(
      "select perches from profiles where id = $1",
      [max],
    );
    expect(perches).toBe(4);
    expect(toasts).toEqual(["The price changed. Take another look."]);
    const fifth = perchOffer(next);
    expect(fifth && confirmLine(fifth)).toBe(
      "Buy the fifth perch for 400 seeds?",
    );
  });
});

const SHOP: Shop = {
  seeds: 1000,
  gear: [],
  loftItems: [],
  nextPerch: { number: 5, price: 400, toGo: 0, affordable: true },
};

describe("f-2: the bought item's burst outlives its offer row (ac-2)", () => {
  it("keeps three burst seeds when the refetch removes the bought perch", async () => {
    const rows = shopRows(SHOP);
    let burst: SeedBurst | null = null;
    const next = await completeBuy(perchOffer(rows)!, rows, {
      buy: async () => ({ ok: true, data: {} }),
      load: async () => ({
        ok: true,
        data: { ...SHOP, seeds: 600, nextPerch: null },
      }),
      toast: noop,
      refresh: noop,
      burst: (itemId) => {
        burst = { itemId, seq: 1 };
      },
    });

    expect(next.loft, "the refetch removed the perch row").toEqual([]);
    const html = renderToStaticMarkup(
      createElement(ShopItems, {
        gear: next.gear,
        loft: next.loft,
        burst,
        onBuy: noop,
      }),
    );
    expect(html.match(/<span class="[^"]*seed[^"]*"/g) ?? []).toHaveLength(3);
  });
});

describe("f-3: a purchase refresh survives an older sync in flight (ac-2)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("syncs again after the older response lands and reports the new balance", async () => {
    const replies: ((res: Response) => void)[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(
      () => new Promise<Response>((resolve) => replies.push(resolve)),
    );
    const results: SyncResult[] = [];
    const sync = startSync({
      fetch,
      win: new EventTarget(),
      doc: Object.assign(new EventTarget(), {
        visibilityState: "visible" as DocumentVisibilityState,
      }),
      everyMs: 3_600_000,
      timezone: "Europe/London",
      onResult: (r) => results.push(r),
    });
    const respond = async (seeds: number) => {
      replies.shift()!(
        new Response(JSON.stringify({ me: { seeds }, serverNow: 0 })),
      );
      await vi.advanceTimersByTimeAsync(0);
    };
    expect(fetch, "the older sync is in flight").toHaveBeenCalledTimes(1);

    const rows = shopRows(SHOP);
    await completeBuy(perchOffer(rows)!, rows, {
      buy: async () => ({ ok: true, data: {} }),
      load: async () => ({ ok: true, data: { ...SHOP, seeds: 250 } }),
      toast: noop,
      refresh: sync.refresh,
      burst: noop,
    });
    await respond(500);
    expect(fetch, "a follow-up sync after the purchase").toHaveBeenCalledTimes(
      2,
    );
    await respond(250);

    const balances = results.map((r) =>
      r.ok ? (r.payload.me as { seeds: number }).seeds : null,
    );
    expect(balances.at(-1), `observed ${JSON.stringify(balances)}`).toBe(250);
    sync.stop();
  });
});
