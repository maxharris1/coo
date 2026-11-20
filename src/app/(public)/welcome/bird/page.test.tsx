import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { firstBird, initialFirstBird, type FirstBirdState } from "./choices";
import { Roommate } from "./FirstBird";
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

describe("/welcome/bird roommate panel (ac-5)", () => {
  const adopted = firstBird(
    firstBird(initialFirstBird(), { type: "rename", name: "Gerry" }),
    { type: "adopt" },
  );
  const render = (state: FirstBirdState) =>
    renderToStaticMarkup(<Roommate state={state} dispatch={() => {}} onSubmit={() => {}} />);
  const panel = render(adopted);

  it("says the first bird has a roommate and draws the second bird", () => {
    expect(panel).toMatch(/<h2[^>]*>Gerry has a roommate<\/h2>/);
    expect(panel).toContain('role="img" aria-label="Brenda"');
  });

  it("prefills the roommate's name and offers its pronouns", () => {
    expect(panel).toMatch(/<label[^>]*for="roommate-name"[^>]*>/);
    expect(panel).toMatch(/<input[^>]*id="roommate-name"[^>]*value="Brenda"/);
    const radios = [
      ...panel.matchAll(
        /type="radio"[^>]*name="roommate-pronoun"[^>]*value="(\w+)"/g,
      ),
    ];
    expect(radios.map((m) => m[1])).toEqual(["he", "she", "they"]);
  });

  it("asks for the person's own name and offers a way back", () => {
    expect(panel).toMatch(/<label[^>]*for="your-name"[^>]*>Your name/);
    expect(panel).toMatch(/<input[^>]*id="your-name"[^>]*required/);
    expect(panel).toMatch(/<button[^>]*type="button"[^>]*>Back<\/button>/);
    expect(panel).toMatch(/<button[^>]*type="submit"[^>]*>Adopt Brenda<\/button>/);
  });

  it("shows the API's error in a toast and keeps what was typed", () => {
    const failed = firstBird(
      firstBird(firstBird(adopted, { type: "yourName", name: "Max" }), {
        type: "send",
      }),
      { type: "failed", message: "That name is not allowed" },
    );
    const html = render(failed);
    expect(html).toMatch(/role="alert"[^>]*>.*That name is not allowed/s);
    expect(html).toMatch(/<input[^>]*id="your-name"[^>]*value="Max"/);
    expect(html).toMatch(/<input[^>]*id="roommate-name"[^>]*value="Brenda"/);
    expect(panel).not.toContain('role="alert"');
  });

  it("disables the submit button while the request is in flight", () => {
    const html = render(firstBird(adopted, { type: "send" }));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it("keeps the panel's controls at the 44 px touch size", () => {
    for (const cls of ["back", "toastClose"]) {
      const rule = css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0];
      expect(rule, `.${cls}`).toMatch(
        /min-(height|block-size): (var\(--coo-touch\)|4[4-9]px|[5-9]\dpx)/,
      );
    }
  });
});
