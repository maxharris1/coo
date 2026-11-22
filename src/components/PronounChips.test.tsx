import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PronounChips } from "./PronounChips";

const css = readFileSync(
  new URL("./PronounChips.module.css", import.meta.url),
  "utf8",
);

const html = renderToStaticMarkup(
  <PronounChips name="roommate-pronoun" value="she" onChange={() => {}} />,
);

describe("PronounChips", () => {
  it("is one radio group labelled Pronoun", () => {
    expect(html).toMatch(/^<fieldset[^>]*><legend[^>]*>Pronoun<\/legend>/);
  });

  it("offers he, she and they under the given name", () => {
    const radios = [
      ...html.matchAll(
        /<label[^>]*><input type="radio"[^>]*name="roommate-pronoun"[^>]*value="(\w+)"[^>]*\/>([^<]+)<\/label>/g,
      ),
    ];
    expect(radios.map((m) => [m[1], m[2]])).toEqual([
      ["he", "he/him"],
      ["she", "she/her"],
      ["they", "they/them"],
    ]);
  });

  it("checks the chosen pronoun only", () => {
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toMatch(/checked="" value="she"/);
  });

  it("keeps each chip at the 44 px touch size and shows focus", () => {
    expect(css).toMatch(/\.chip \{[^}]*min-height: var\(--coo-touch\)/);
    expect(css).toMatch(/\.chip:has\(input:focus-visible\) \{[^}]*outline:/);
  });
});
