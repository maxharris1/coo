import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HelloPage from "./page";

const html = renderToStaticMarkup(<HelloPage />).replaceAll("&#x27;", "'");
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../auth.module.css");

describe("/welcome (Hello)", () => {
  it("shows the logo, the tagline and the docs/07 paragraph", () => {
    expect(html).toMatch(/<h1[^>]*>coo<\/h1>/);
    expect(html).toContain("Messages, eventually.");
    expect(html).toContain(
      "Write a note. Tie it to a pigeon. It flies there for real, on a real map, at pigeon speed.",
    );
  });

  it("draws the Welcome mock's hero as one labelled image", () => {
    expect(html).toContain(
      'role="img" aria-label="A grey city pigeon, freshly hatched, standing between two halves of an eggshell and staring at you."',
    );
    expect(html).toContain('fill="var(--coo-sky)"');
  });

  it("sends both the button and the link to sign-in", () => {
    expect(html).toMatch(/<a[^>]*href="\/sign-in"[^>]*>Get a pigeon<\/a>/);
    expect(html).toMatch(
      /<a[^>]*href="\/sign-in"[^>]*>I already have a loft<\/a>/,
    );
  });

  it("styles with tokens only", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(read("./page.tsx")).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("keeps both tap targets at least 44 px", () => {
    for (const cls of ["primary", "secondary"]) {
      const rule = css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0];
      expect(rule, `.${cls}`).toMatch(
        /min-(height|block-size): (var\(--coo-touch\)|4[4-9]px|[5-9]\dpx)/,
      );
    }
  });
});
