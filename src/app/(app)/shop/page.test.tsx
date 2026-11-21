import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SyncContext } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toasts";
import type { Shop } from "@/server/services/shop";
import ShopPage from "./page";
import { openShop } from "./shop";
import { ShopTop } from "./ShopTop";

const css = readFileSync(
  new URL("./ShopTop.module.css", import.meta.url),
  "utf8",
);
const SHOP: Shop = { seeds: 240, gear: [], loftItems: [], nextPerch: null };

describe("/shop header (ac-1)", () => {
  const html = renderToStaticMarkup(<ShopTop seeds={240} />);

  it("draws the awning stripe in tomato and card", () => {
    expect(html).toMatch(
      /<div aria-hidden="true" class="[^"]*awning[^"]*"><\/div>/,
    );
    expect(css).toMatch(
      /\.awning\s*{[^}]*repeating-linear-gradient\(\s*90deg,\s*var\(--coo-tomato\)/,
    );
    expect(css).toMatch(/\.awning\s*{[^}]*var\(--coo-card\)/);
  });

  it("titles the page Seed store", () => {
    expect(html).toMatch(/<h1[^>]*>Seed store<\/h1>/);
  });

  it("labels the balance pill with the seed count", () => {
    expect(html).toMatch(
      /<div[^>]*aria-label="You have 240 seeds"[^>]*>.*<span>240<\/span><\/div>/,
    );
  });

  it("says how seeds are earned and links More ways to /earn", () => {
    expect(html).toContain("You earn seeds every time a note lands.");
    expect(html).toMatch(/<a[^>]*href="\/earn"[^>]*>More ways<\/a>/);
  });

  it("keeps More ways a 44 px tap target", () => {
    expect(css).toMatch(/\.more\s*{[^}]*min-height:\s*var\(--coo-touch\)/);
  });
});

describe("/shop states (ac-2)", () => {
  it("shows the loader while GET /api/shop is pending", () => {
    const html = renderToStaticMarkup(
      <SyncContext.Provider
        value={{ data: null, error: null, offsetMs: 0, refresh: () => {} }}
      >
        <ToastProvider>
          <ShopPage />
        </ToastProvider>
      </SyncContext.Provider>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Seed store");
  });

  it("hands back the shop rows when the load succeeds", async () => {
    const toast = vi.fn();
    const rows = await openShop(async () => ({ ok: true, data: SHOP }), toast);
    expect(rows).toEqual({ seeds: 240, gear: [], loft: [] });
    expect(toast).not.toHaveBeenCalled();
  });

  it("toasts the API's message when the load fails", async () => {
    const toast = vi.fn();
    const rows = await openShop(
      async () => ({ ok: false, message: "Sign in first." }),
      toast,
    );
    expect(rows).toBeNull();
    expect(toast).toHaveBeenCalledWith("Sign in first.");
  });
});
