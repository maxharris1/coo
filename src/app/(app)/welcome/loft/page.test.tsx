import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialLoft, loft, type LoftState } from "./roost";
import { LoftForm } from "./Loft";
import LoftPage from "./page";

const decode = (html: string) =>
  html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const html = decode(renderToStaticMarkup(<LoftPage />));
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const noop = async () => {};
const render = (state: LoftState) =>
  decode(
    renderToStaticMarkup(
      <LoftForm
        state={state}
        dispatch={() => {}}
        actions={{
          locate: noop,
          search: noop,
          pick: noop,
          townCentre: noop,
          home: noop,
        }}
      />,
    ),
  );

const located = loft(initialLoft(), {
  type: "located",
  roost: {
    lat: 40.714,
    lon: -73.9625,
    label: "Williamsburg",
    city: "Brooklyn, NY",
  },
  pending: { lat: 40.714, lon: -73.9625 },
});

describe("/welcome/loft", () => {
  it("asks whether the link's destination is home when prefilled from a guest link", () => {
    const linked = loft(initialLoft(), {
      type: "linked",
      roost: { lat: 39.95, lon: -75.16, label: "Philadelphia", city: null },
    });
    expect(linked.pending).toEqual({ lat: 39.95, lon: -75.16 });
    expect(render(linked)).toContain("Your roost: Philadelphia");
    expect(render(linked)).toContain("Is this where birds should find you?");
    expect(render(located)).not.toContain(
      "Is this where birds should find you?",
    );
  });

  it("asks where birds should find you as step 3 of 3", () => {
    expect(html).toContain("Step 3 of 3");
    expect(html).toMatch(/<h1[^>]*>Where should birds find you\?<\/h1>/);
  });

  it("offers 'Use my location' and a labelled neighbourhood search", () => {
    expect(html).toMatch(/<button[^>]*>Use my location<\/button>/);
    expect(html).toMatch(
      /<label[^>]*for="loft-search"[^>]*>Search a neighbourhood<\/label>/,
    );
    expect(html).toMatch(/<input[^>]*type="search"[^>]*id="loft-search"/);
  });

  it("lists search results by label and city as buttons", () => {
    const view = render(
      loft(initialLoft(), {
        type: "results",
        results: [
          {
            placeId: "p",
            label: "Williamsburg",
            sublabel: "Brooklyn, NY",
            kind: "neighbourhood",
          },
        ],
      }),
    );
    expect(view).toMatch(
      /<button[^>]*>.*Williamsburg.*Brooklyn, NY.*<\/button>/s,
    );
  });

  it("shows the roost, the map preview, the privacy line and both ways forward", () => {
    const view = render(located);
    expect(view).toContain("Your roost: Williamsburg, Brooklyn, NY");
    expect(view).toMatch(
      /role="img"[^>]*aria-label="Map of Williamsburg with your roost pin"/,
    );
    expect(view).toContain("We keep the roost, not your address.");
    expect(view).toMatch(/<button[^>]*>Use my town centre instead<\/button>/);
    expect(view).toMatch(
      /<button[^>]*type="submit"[^>]*>This is home<\/button>/,
    );
  });

  it("hides 'This is home' until a roost is chosen", () => {
    expect(html).not.toContain("This is home");
    expect(html).not.toContain("Use my town centre instead");
  });

  it("shows errors as a dismissable alert", () => {
    const view = render(
      loft(located, { type: "failed", message: "Could not find that place" }),
    );
    expect(view).toMatch(/role="alert"[^>]*>.*Could not find that place/s);
  });

  it("keeps every control at least the 44 px touch size", () => {
    for (const cls of ["locate", "result", "link", "home", "toastClose"]) {
      const rule = css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0];
      expect(rule, `.${cls}`).toMatch(
        /min-(height|block-size): (var\(--coo-touch\)|4[4-9]px|[5-9]\dpx)/,
      );
    }
  });

  it("fits phones from 360 px: the column never sets a fixed width and the map scales", () => {
    expect(css).toMatch(/\.page \{[^}]*max-width: 480px/);
    expect(css).not.toMatch(/(?<!max-|min-)width: (3[6-9]\d|4\d\d)px/);
    expect(css).toMatch(/\.map \{[^}]*width: 100%[^}]*aspect-ratio/);
  });
});
