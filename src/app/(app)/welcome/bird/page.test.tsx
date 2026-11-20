import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FirstBirdPage from "./page";

const html = renderToStaticMarkup(<FirstBirdPage />).replaceAll("&#x27;", "'");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

describe("/welcome/bird", () => {
  it("shows the Welcome mock's copy", () => {
    for (const text of [
      ">coo<",
      "Messages, eventually.",
      "Step 2 of 3",
      "Meet your first bird",
      "City pigeon, 1 of 3",
      ">45 mph<",
      ">Loyal<",
      ">Bread-motivated<",
      "Name your pigeon",
      "Adopt Gerald",
      "Next we ask for your city, never your address. Birds land at a neighborhood roost, not your front door.",
    ])
      expect(html).toContain(text);
  });

  it("labels the look buttons and the drawn bird", () => {
    expect(html).toContain('aria-label="Previous bird"');
    expect(html).toContain('aria-label="Next bird"');
    expect(html).toContain('role="img" aria-label="Gerald"');
  });

  it("labels the name field and prefills it", () => {
    expect(html).toMatch(/<label[^>]*for="bird-name"[^>]*>Name your pigeon/);
    expect(html).toMatch(/<input[^>]*id="bird-name"[^>]*value="Gerald"/);
    expect(html).toContain('aria-label="Shuffle name"');
  });

  it("offers pronoun chips as one labelled radio group", () => {
    expect(html).toMatch(/<fieldset[^>]*>.*<legend[^>]*>Pronoun<\/legend>/s);
    const radios = [
      ...html.matchAll(/type="radio"[^>]*name="pronoun"[^>]*value="(\w+)"/g),
    ];
    expect(radios.map((m) => m[1])).toEqual(["he", "she", "they"]);
  });

  it("keeps every control at least the 44 px touch size", () => {
    for (const cls of ["arrow", "shuffle", "chip", "adopt"]) {
      const rule = css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0];
      expect(rule, `.${cls}`).toMatch(
        /min-(height|block-size): (var\(--coo-touch\)|4[4-9]px|[5-9]\dpx)/,
      );
    }
  });

  it("stops the look slide when the person asks for reduced motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^@]*animation: none/,
    );
  });
});
