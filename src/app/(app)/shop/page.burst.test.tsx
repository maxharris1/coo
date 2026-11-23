import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext } from "@/components/SyncProvider";
import type { Shop } from "@/server/services/shop";
import type { ConfirmBuy } from "./ConfirmBuy";
import ShopPage from "./page";
import type { BuyRow } from "./shop";
import type { ShopItems } from "./ShopItems";

const view = vi.hoisted(() => ({
  items: null as ComponentProps<typeof ShopItems> | null,
  confirm: null as ComponentProps<typeof ConfirmBuy> | null,
  toast: () => {},
}));

vi.mock("./ShopItems", () => ({
  ShopItems: (props: ComponentProps<typeof ShopItems>) => {
    view.items = props;
    return null;
  },
}));

vi.mock("./ConfirmBuy", () => ({
  ConfirmBuy: (props: ComponentProps<typeof ConfirmBuy>) => {
    view.confirm = props;
    return null;
  },
}));

vi.mock("./ShopTop", async (actual) => ({
  ...(await actual<typeof import("./ShopTop")>()),
  ShopTop: () => null,
}));

vi.mock("@/components/Loader", () => ({ Loader: () => null }));

vi.mock("@/components/Toasts", () => ({ useToast: () => view.toast }));

const { ShopItems: RealShopItems } =
  await vi.importActual<typeof import("./ShopItems")>("./ShopItems");

let perch: number;
let root: Root;

const shop = (): Shop => ({
  seeds: 2000,
  gear: [],
  loftItems: [],
  nextPerch: { number: perch, price: 250, affordable: true, toGo: 0 },
  consumables: [],
});

function fakeFetch(url: RequestInfo | URL) {
  if (String(url) === "/api/shop/buy") {
    perch += 1;
    return Promise.resolve(Response.json({ me: {}, closet: [] }));
  }
  return Promise.resolve(Response.json(shop()));
}

const burstSeeds = () => {
  const html = renderToStaticMarkup(<RealShopItems {...view.items!} />);
  return (html.match(/<span class="([^"]*seed[^"]*)"/g) ?? []).map((tag) =>
    tag.replace(/^<span class="|"$/g, ""),
  );
};

async function buyPerch() {
  const row = view.items!.loft.find((r) => r.itemId === "perch")!;
  await act(async () => view.items!.onBuy(row as BuyRow));
  await act(async () => view.confirm!.onConfirm());
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(async () => {
  vi.useFakeTimers();
  perch = 4;
  view.items = null;
  view.confirm = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  root = createRoot(container);
  await act(async () => {
    root.render(
      <SyncContext.Provider
        value={{ data: null, error: null, offsetMs: 0, refresh: () => {} }}
      >
        <ShopPage />
      </SyncContext.Provider>,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("/shop seed burst on a second purchase (#479)", () => {
  it("plays the second perch's burst for the full 1.8 s after its success", async () => {
    expect(view.items!.loft.map((r) => r.name)).toEqual(["Fourth perch"]);
    await buyPerch();
    expect(burstSeeds(), "the fourth perch bursts").toHaveLength(3);

    await advance(1000);
    expect(view.items!.loft.map((r) => r.name)).toEqual(["Fifth perch"]);
    await buyPerch();

    await advance(800);
    const seeds = burstSeeds();
    expect(seeds, "coo-burst, coo-burst-l and coo-burst-u still play").toEqual([
      expect.not.stringMatching(/seed[LU]/),
      expect.stringMatching(/seedL/),
      expect.stringMatching(/seedU/),
    ]);

    await advance(1000);
    expect(burstSeeds(), "the burst is gone 1.8 s after the success").toEqual(
      [],
    );
  });

  it("hands the second purchase a fresh burst so its seeds remount", async () => {
    await buyPerch();
    const first = view.items!.burst;
    await advance(1000);
    await buyPerch();
    expect(view.items!.burst).not.toEqual(first);
  });
});
