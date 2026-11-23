import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { firstBird, initialFirstBird, type FirstBirdState } from "./choices";
import { FirstBirdForm } from "./FirstBird";
import FirstBirdPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const html = renderToStaticMarkup(<FirstBirdPage />).replaceAll("&#x27;", "'");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

describe("/welcome/bird", () => {
  it("shows the Welcome mock's copy", () => {
    for (const text of [
      ">coo<",
      "Messages, eventually.",
      "Step 1 of 3",
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

  it("asks for your name first, before the carousel (ac-2)", () => {
    expect(html).toMatch(/<label[^>]*for="your-name"[^>]*>Your name/);
    expect(html).toMatch(/<input[^>]*id="your-name"[^>]*required/);
    const order = [
      'id="your-name"',
      'aria-roledescription="carousel"',
      'id="bird-name"',
      'name="pronoun"',
      'type="submit"',
    ].map((marker) => html.indexOf(marker));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("offers pronoun chips as one labelled radio group", () => {
    expect(html).toMatch(/<fieldset[^>]*>.*<legend[^>]*>Pronoun<\/legend>/s);
    const radios = [
      ...html.matchAll(/type="radio"[^>]*name="pronoun"[^>]*value="(\w+)"/g),
    ];
    expect(radios.map((m) => m[1])).toEqual(["he", "she", "they"]);
  });

  it("keeps every control at least the 44 px touch size", () => {
    for (const cls of ["arrow", "shuffle", "adopt"]) {
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

describe("/welcome/bird adopts from one panel (ac-1)", () => {
  const typed = firstBird(
    firstBird(initialFirstBird(), { type: "rename", name: "Gerry" }),
    { type: "yourName", name: "Max" },
  );
  const render = (state: FirstBirdState) =>
    renderToStaticMarkup(
      <FirstBirdForm state={state} dispatch={() => {}} onSubmit={() => {}} />,
    );

  it("never shows a roommate panel", () => {
    expect(html).not.toContain("roommate");
    expect(html).not.toContain("has a roommate");
    expect(html).not.toMatch(/>Back</);
  });

  it("has one submit button, Adopt", () => {
    const submits = [
      ...html.matchAll(/<button[^>]*type="submit"[^>]*>([^<]*)</g),
    ];
    expect(submits.map((m) => m[1])).toEqual(["Adopt Gerald"]);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it("shows the API's error in a toast and keeps what was typed", () => {
    const failed = firstBird(firstBird(typed, { type: "send" }), {
      type: "failed",
      message: "That name is not allowed",
    });
    const page = render(failed);
    expect(page).toMatch(/role="alert"[^>]*>.*That name is not allowed/s);
    expect(page).toMatch(/<input[^>]*id="your-name"[^>]*value="Max"/);
    expect(page).toMatch(/<input[^>]*id="bird-name"[^>]*value="Gerry"/);
    expect(page).toContain('aria-label="Dismiss"');
    expect(render(typed)).not.toContain('role="alert"');
  });

  it("disables Adopt while the request is in flight", () => {
    const page = render(firstBird(typed, { type: "send" }));
    expect(page).toMatch(
      /<button[^>]*type="submit"[^>]*disabled[^>]*>Adopt Gerry/,
    );
  });

  it("drops the roommate panel's styles", () => {
    expect(css).not.toMatch(/\.subtitle\b/);
    expect(css).not.toMatch(/\.back\b/);
  });
});

describe("/welcome/bird fits a 390x844 phone (ac-2)", () => {
  const SCREEN = 844;
  const SAFE_TOP = 47;
  const SAFE_BOTTOM = 34;
  const TAGLINE = 26;
  const TITLE = 36;
  const LABEL = 20;
  const ABOUT = 55;
  const PRONOUNS = 70;

  const body = (name: string) => {
    const found = css.match(
      new RegExp(`(?:^|\\n)\\.${name} \\{([^}]*)\\}`),
    )?.[1];
    if (found === undefined) throw new Error(`no .${name} rule`);
    return found;
  };
  const px = (name: string, prop: string, at = 0) => {
    const decl = body(name).match(
      new RegExp(`(?:^|\\s)${prop}: ([^;]+);`),
    )?.[1];
    const all = [
      ...(decl ?? "")
        .replace(/env\([^)]*\)/g, "")
        .matchAll(/(\d+(?:\.\d+)?)px/g),
    ];
    if (all[at] === undefined) throw new Error(`no px in .${name} ${prop}`);
    return Number(all[at][1]);
  };
  const number = (name: string, prop: string) =>
    Number(body(name).match(new RegExp(`(?:^|\\s)${prop}: ([\\d.]+);`))![1]);

  const topPad = px("page", "padding");
  const bottomPad = px("page", "padding", 1);
  const header =
    px("logo", "font-size") * number("logo", "line-height") + TAGLINE;
  const field = LABEL + px("field", "gap") + px("name", "height");
  const stage = px("stage", "flex", 0);
  const rows = [
    header,
    TITLE,
    field,
    stage,
    ABOUT,
    field,
    PRONOUNS,
    px("adopt", "min-height"),
  ];
  const gaps = 2 * px("page", "gap") + 5 * px("form", "gap");
  const throughAdopt =
    SAFE_TOP + topPad + rows.reduce((sum, row) => sum + row, 0) + gaps;

  it("keeps the page padding that safeTop.test.ts pins", () => {
    expect(topPad).toBe(28);
    expect(bottomPad).toBe(20);
  });

  it("fits Your name, Name your pigeon, the pronoun chips and Adopt above the fold", () => {
    expect(throughAdopt).toBeLessThanOrEqual(SCREEN - SAFE_BOTTOM - bottomPad);
  });
});
