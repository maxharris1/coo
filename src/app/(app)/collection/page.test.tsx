import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { badgesView, birdsView } from "./collection";
import { CollectionView } from "./CollectionView";
import CollectionPage from "./page";

const tokens = readFileSync(
  new URL("../../../../public/assets/tokens.css", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./Collection.module.css", import.meta.url),
  "utf8",
);

const EARNED = new Set(["first-flight", "night-owl"]);
const BADGES = badgesView(
  config.badges.badges.map((b) => ({
    id: b.id,
    name: b.name,
    text: b.text,
    icon: b.icon,
    goal: b.goal,
    progress: EARNED.has(b.id) ? b.goal : b.id === "rfc-1149" ? 4 : 0,
    earnedAt: EARNED.has(b.id) ? 1_700_000_000_000 : null,
  })),
);

const BIRDS = birdsView(
  11,
  ["Kevin", "Pip", "Lou", "Biscuit", "Gerald"].map((name) => ({
    name,
    look: "gerald",
    breed: "city",
    gear: [],
  })),
);

const ready = (birds = BIRDS) =>
  ({ kind: "ready", badges: BADGES, birds }) as const;

const view = (state: Parameters<typeof CollectionView>[0]["state"]) =>
  renderToStaticMarkup(<CollectionView state={state} onRetry={() => {}} />);

const rule = (selector: string) =>
  css.match(new RegExp(`\\.${selector}\\s*{([^}]*)}`))?.[1] ?? "";

describe("/collection loading", () => {
  it("shows the loader and no title while GET /api/collection is pending", () => {
    const html = renderToStaticMarkup(<CollectionPage />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/<h1[^>]*>Collection<\/h1>/);
  });
});

describe("/collection header", () => {
  const html = view(ready());

  it("titles the page Collection", () => {
    expect(html).toMatch(
      /<header[^>]*>.*<h1[^>]*>Collection<\/h1>.*<\/header>/,
    );
  });

  it("links back to /more with a label", () => {
    expect(html).toMatch(
      /<a[^>]*href="\/more"[^>]*aria-label="Back to the post office"|<a[^>]*aria-label="Back to the post office"[^>]*href="\/more"/,
    );
    expect(html).toContain('d="M15 5 L8 12 L15 19"');
  });

  it("keeps the back link a 44 px circle", () => {
    expect(rule("back")).toMatch(/width:\s*var\(--coo-touch\)/);
    expect(rule("back")).toMatch(/height:\s*var\(--coo-touch\)/);
    expect(rule("back")).toMatch(/border-radius:\s*50%/);
  });

  it("sets the title in the display face at 28 px", () => {
    expect(rule("title")).toMatch(/font-family:\s*var\(--coo-font-display\)/);
    expect(rule("title")).toMatch(/font-size:\s*28px/);
  });
});

describe("/collection badges", () => {
  const html = view(ready());

  it("heads the section Badges with the earned count", () => {
    expect(html).toMatch(/<h2[^>]*>Badges<\/h2>/);
    expect(html).toContain(">2 of 12<");
  });

  it("lists earned badges before unearned ones", () => {
    const order = ["First flight", "Night owl", "Cher Ami", "RFC 1149"].map(
      (name) => html.indexOf(`>${name}<`),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows progress on an unearned counted badge", () => {
    expect(html).toContain(">Replies on the same bird: 4 of 9<");
  });

  it("marks earned and unearned cards apart beyond the border", () => {
    const kinds = (html.match(/<li class="[^"]*"/g) ?? []).map((li) =>
      /[\s"_]unearned/.test(li)
        ? "unearned"
        : /[\s"_]earned/.test(li)
          ? "earned"
          : "none",
    );
    expect(kinds).toEqual([
      ...Array<string>(2).fill("earned"),
      ...Array<string>(10).fill("unearned"),
    ]);
    expect(html.match(/Not earned yet/g)).toHaveLength(10);
  });

  it("draws each badge icon from its SVG as an ink mask", () => {
    expect(html).toContain("/assets/svg/icons/feather.svg");
    expect(html).toMatch(
      /mask-image:url\(\/assets\/svg\/icons\/feather\.svg\)/,
    );
  });

  it("masks every badge with an icon asset that exists", () => {
    const urls = [
      ...html.matchAll(/"mask-image:url\((\/assets\/svg\/icons\/[^)]+)\)/g),
    ].map((m) => m[1]);
    expect(urls).toHaveLength(config.badges.badges.length);
    const missing = urls.filter(
      (url) =>
        !existsSync(new URL(`../../../../public${url}`, import.meta.url)),
    );
    expect(missing).toEqual([]);
  });

  it("tints the icon disc by token", () => {
    expect(css).toMatch(/\.sun\s*{[^}]*var\(--coo-sun\)/);
    expect(css).toMatch(/\.mint\s*{[^}]*var\(--coo-mint\)/);
  });

  it("borders earned cards solid and unearned cards dashed", () => {
    expect(rule("earned")).toMatch(/border:\s*2\.5px solid var\(--coo-ink\)/);
    expect(rule("earned")).toMatch(/background:\s*var\(--coo-card\)/);
    expect(rule("unearned")).toMatch(
      /border:\s*2\.5px dashed var\(--coo-ink\)/,
    );
    expect(rule("unearned")).toMatch(/background:\s*var\(--coo-sand\)/);
  });

  it("lays badges out in two columns with a 42 px disc", () => {
    expect(rule("grid")).toMatch(
      /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(rule("disc")).toMatch(/width:\s*42px/);
    expect(rule("disc")).toMatch(/height:\s*42px/);
  });
});

describe("/collection birds you have met", () => {
  const html = view(ready());

  it("heads the section with how many birds I have met", () => {
    expect(html).toMatch(/<h2[^>]*>Birds you have met<\/h2>/);
    expect(html).toContain(">11 met<");
  });

  it("shows each recent bird as an avatar named for the bird", () => {
    for (const name of ["Kevin", "Pip", "Lou", "Biscuit", "Gerald"]) {
      expect(html).toMatch(
        new RegExp(`<svg[^>]*role="img"[^>]*aria-label="${name}"`),
      );
    }
    expect(html.match(/<svg[^>]*role="img"/g)).toHaveLength(5);
  });

  it("sums up the birds not shown in a chip", () => {
    expect(html).toMatch(
      /<div[^>]*role="img"[^>]*aria-label="6 more met"[^>]*>\+6<\/div>/,
    );
  });

  it("drops the chip when every bird met is shown", () => {
    const all = view(ready(birdsView(5, BIRDS.shown)));
    expect(all).not.toContain("more met");
    expect(all).not.toContain(">+");
  });

  it("keeps the heading and count with no birds met", () => {
    const none = view(ready(birdsView(0, [])));
    expect(none).toMatch(/<h2[^>]*>Birds you have met<\/h2>/);
    expect(none).toContain(">0 met<");
    expect(none).not.toMatch(/<svg[^>]*role="img"/);
    expect(none).not.toContain("more met");
  });

  it("crops each bird to a 50 px ink-ringed circle", () => {
    expect(rule("avatar")).toMatch(/width:\s*50px/);
    expect(rule("avatar")).toMatch(/height:\s*50px/);
    expect(rule("avatar")).toMatch(/border:\s*var\(--coo-line-thin\)/);
    expect(rule("avatar")).toMatch(/border-radius:\s*50%/);
    expect(rule("avatar")).toMatch(/overflow:\s*hidden/);
    expect(css).toMatch(/\.peach\s*{[^}]*var\(--coo-peach\)/);
  });

  it("draws the chip as a dashed 50 px circle in muted 900 text", () => {
    expect(rule("more")).toMatch(/width:\s*50px/);
    expect(rule("more")).toMatch(/height:\s*50px/);
    expect(rule("more")).toMatch(/border:\s*var\(--coo-line-dashed-soft\)/);
    expect(tokens).toMatch(/--coo-line-dashed-soft:\s*2\.5px dashed #B9B3C9;/);
    expect(rule("more")).toMatch(/border-radius:\s*50%/);
    expect(rule("more")).toMatch(/color:\s*var\(--coo-muted\)/);
    expect(rule("more")).toMatch(/font-weight:\s*900/);
    expect(rule("more")).toMatch(/font-size:\s*14px/);
  });

  it("lines the birds up in a row 8 px apart", () => {
    expect(rule("met")).toMatch(/display:\s*flex/);
    expect(rule("met")).toMatch(/gap:\s*8px/);
    expect(rule("met")).toMatch(/align-items:\s*center/);
  });
});

describe("/collection error", () => {
  const html = view({ kind: "error", message: "Sign in first." });

  it("keeps the header and shows the message with Try again", () => {
    expect(html).toMatch(/<h1[^>]*>Collection<\/h1>/);
    expect(html).toMatch(/<p[^>]*role="alert"[^>]*>Sign in first\.<\/p>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Try again<\/button>/);
    expect(html).not.toContain("Badges");
  });

  it("keeps Try again a 44 px tap target", () => {
    expect(rule("retry")).toMatch(/min-height:\s*var\(--coo-touch\)/);
  });
});
