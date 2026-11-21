import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ShopRow, ShopRows } from "./shop";
import { ShopItems } from "./ShopItems";

const css = readFileSync(
  new URL("./ShopItems.module.css", import.meta.url),
  "utf8",
);
const rule = (cls: string) =>
  css.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`))?.[0] ?? "";

const MOCK: ShopRows = {
  seeds: 240,
  gear: [
    {
      itemId: "goggles",
      name: "Aviator goggles",
      effect: "Holds full speed in rain",
      action: { kind: "owned", label: "In the closet" },
    },
    {
      itemId: "rainhat",
      name: "Rain hat",
      effect: "Shrugs off downpours",
      action: { kind: "buy", price: 120 },
    },
    {
      itemId: "cap",
      name: "Captain's cap",
      effect: "Steadier in a headwind",
      action: { kind: "buy", price: 160 },
    },
    {
      itemId: "tube",
      name: "Roomy leg tube",
      effect: "Notes up to 280 characters",
      action: { kind: "buy", price: 200 },
    },
    {
      itemId: "booties",
      name: "Rain booties",
      effect: "No muddy feet on the sill",
      action: { kind: "buy", price: 60 },
    },
  ],
  loft: [
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
  ],
};

const render = (rows: Pick<ShopRows, "gear" | "loft">) =>
  renderToStaticMarkup(
    <ShopItems gear={rows.gear} loft={rows.loft} />,
  ).replaceAll("&#x27;", "'");

const cards = (html: string) =>
  html.match(/<li[^>]*class="[^"]*row[^"]*"[^>]*>.*?<\/li>/g) ?? [];

describe("/shop gear and loft lists (ac-1)", () => {
  const html = render(MOCK);

  it("heads the gear list Gear for the flock with Any bird can wear it", () => {
    expect(html).toMatch(/<h2[^>]*>Gear for the flock<\/h2>/);
    expect(html).toContain(">Any bird can wear it<");
  });

  it("heads the loft list For the loft", () => {
    expect(html).toMatch(/<h2[^>]*>For the loft<\/h2>/);
    expect(html.indexOf("For the loft")).toBeGreaterThan(
      html.indexOf("Rain booties"),
    );
  });

  it("draws one card per row in order", () => {
    const names = cards(html).map(
      (card) => card.match(/class="[^"]*name[^"]*">([^<]*)</)?.[1],
    );
    expect(names).toEqual([
      "Aviator goggles",
      "Rain hat",
      "Captain's cap",
      "Roomy leg tube",
      "Rain booties",
      "Rooftop birdbath",
      "Fifth perch",
    ]);
  });

  it("gives every card its effect line", () => {
    const effects = cards(html).map(
      (card) => card.match(/class="[^"]*effect[^"]*">([^<]*)</)?.[1],
    );
    expect(effects).toEqual([
      "Holds full speed in rain",
      "Shrugs off downpours",
      "Steadier in a headwind",
      "Notes up to 280 characters",
      "No muddy feet on the sill",
      "Feathers stay clean twice as long",
      "Room for one more bird",
    ]);
  });

  it("puts each gear icon from assets in a tile tinted as the mock", () => {
    const tiles = cards(html).map(
      (card) =>
        card.match(/<div aria-hidden="true" class="[^"]*tile[^"]*"[^>]*>/)?.[0],
    );
    expect(tiles.every(Boolean)).toBe(true);
    expect(html).toContain('src="/assets/svg/gear/icons/goggles.svg"');
    expect(html).toContain('src="/assets/svg/gear/icons/booties.svg"');
    const tints = tiles.map((tile) => tile?.match(/var\(--coo-(\w+)\)/)?.[1]);
    expect(tints).toEqual([
      "sky",
      "sky",
      "lilac",
      "sun",
      "peach",
      "sky",
      "sun",
    ]);
  });

  it("draws the birdbath and perch icons inline", () => {
    const [bath, perch] = cards(html).slice(5);
    expect(bath).toMatch(/<svg[^>]*viewBox="0 0 32 32"/);
    expect(perch).toMatch(/<svg[^>]*viewBox="0 0 32 32"/);
  });

  it("falls back to a sky tile for gear the mock does not draw", () => {
    const backpack: ShopRow = {
      itemId: "backpack",
      name: "Tiny backpack",
      effect: "Carries more",
      action: { kind: "buy", price: 300 },
    };
    const [card] = cards(render({ gear: [backpack], loft: [] }));
    expect(card).toMatch(/class="[^"]*tile[^"]*" style="[^"]*--coo-sky/);
    expect(card).toContain('src="/assets/svg/gear/icons/backpack.svg"');
  });

  it("shows In the closet as a mint chip on owned gear", () => {
    const [goggles] = cards(html);
    expect(goggles).toMatch(/class="[^"]*chip[^"]*">In the closet</);
    expect(goggles).not.toContain("<button");
    expect(rule("chip")).toMatch(/background:\s*var\(--coo-mint\)/);
  });

  it("shows In the loft on an owned birdbath", () => {
    const bath: ShopRow = {
      ...MOCK.loft[0],
      action: { kind: "owned", label: "In the loft" },
    };
    const [card] = cards(render({ gear: [], loft: [bath] }));
    expect(card).toMatch(/class="[^"]*chip[^"]*">In the loft</);
  });

  it("shows a seed price button on buyable rows", () => {
    const rainhat = cards(html)[1];
    expect(rainhat).toMatch(
      /<button type="button"[^>]*class="[^"]*price[^"]*"[^>]*><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg><span>120<\/span><\/button>/,
    );
    expect(rule("price")).toMatch(/background:\s*var\(--coo-sun\)/);
    expect(rule("price")).toMatch(/box-shadow:\s*var\(--coo-shadow-1\)/);
  });

  it("shows the price and n to go as text when short of seeds", () => {
    const perch = cards(html)[6];
    expect(perch).not.toContain("<button");
    expect(perch).toMatch(/<span>400<\/span>/);
    expect(perch).toContain(">160 to go<");
  });

  it("holds at 360 px by letting the text wrap beside a fixed action", () => {
    expect(rule("text")).toMatch(/min-width:\s*0/);
    expect(rule("text")).toMatch(/flex:\s*1/);
    expect(rule("chip")).toMatch(/flex-shrink:\s*0/);
    expect(rule("chip")).toMatch(/white-space:\s*nowrap/);
    expect(rule("price")).toMatch(/flex-shrink:\s*0/);
    expect(rule("short")).toMatch(/flex-shrink:\s*0/);
    expect(rule("tile")).toMatch(/flex-shrink:\s*0/);
  });
});

describe("/shop price buttons (ac-2)", () => {
  const html = render(MOCK);

  it("labels every price button Buy {name} for {price} seeds", () => {
    const labels = [...html.matchAll(/<button[^>]*aria-label="([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(labels).toEqual([
      "Buy Rain hat for 120 seeds",
      "Buy Captain's cap for 160 seeds",
      "Buy Roomy leg tube for 200 seeds",
      "Buy Rain booties for 60 seeds",
      "Buy Rooftop birdbath for 220 seeds",
    ]);
  });

  it("keeps every price button at least 44 px", () => {
    expect(rule("price")).toMatch(/min-height:\s*var\(--coo-touch\)/);
    expect(rule("price")).toMatch(/min-width:\s*78px/);
  });

  it("shows a focus ring on price buttons", () => {
    expect(css).toMatch(/\.price:focus-visible\s*\{[^}]*outline:/);
  });
});
