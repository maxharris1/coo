import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmBuy } from "./ConfirmBuy";
import type { BuyRow } from "./shop";

const css = readFileSync(
  new URL("./ConfirmBuy.module.css", import.meta.url),
  "utf8",
);

const RAIN_HAT: BuyRow = {
  itemId: "rainhat",
  name: "Rain hat",
  effect: "Shrugs off downpours",
  action: { kind: "buy", price: 180 },
};

const render = (busy: boolean) =>
  renderToStaticMarkup(
    <ConfirmBuy
      row={RAIN_HAT}
      busy={busy}
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  );

const button = (html: string, label: string) =>
  html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0] ?? "";

describe("/shop confirm step (part 4 ac-1)", () => {
  it("asks one question in a labelled modal dialog", () => {
    const html = render(false);
    expect(html.match(/role="dialog"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-modal="true"/);
    const id = html.match(/aria-labelledby="([^"]+)"/)![1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(
      new RegExp(`id="${id}"[^>]*>Buy the rain hat for 180 seeds\\?<`),
    );
  });

  it("offers Buy it and Not now", () => {
    const html = render(false);
    expect(button(html, "Buy it")).not.toBe("");
    expect(button(html, "Not now")).not.toBe("");
    expect(button(html, "Buy it")).not.toContain("disabled");
  });

  it("disables Buy it while the request is in flight", () => {
    const html = render(true);
    expect(button(html, "Buy it")).toContain('disabled=""');
    expect(html).toMatch(/aria-busy="true"/);
  });

  it("keeps both answers 44 px tap targets", () => {
    expect(css).toMatch(
      /\.yes,\s*\.no\s*\{[^}]*min-height:\s*var\(--coo-touch\)/,
    );
  });
});
