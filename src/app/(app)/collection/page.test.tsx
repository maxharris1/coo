import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { badgesView, postmarksView } from "./collection";
import { CollectionView } from "./CollectionView";
import CollectionPage from "./page";

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

const day = (d: number) => Date.UTC(2026, 10, d, 15);
const POSTMARKS = postmarksView(
  [
    ["Philadelphia", "PA", day(19)],
    ["Boston", "MA", day(12)],
    ["Hoboken", "NJ", day(9)],
    ["Chicago", "IL", day(2)],
  ].map(([city, region, earnedAt]) => ({
    city: city as string,
    region: region as string,
    country: "US",
    earnedAt: earnedAt as number,
  })),
  day(10),
  "America/New_York",
);

const READY = { kind: "ready", postmarks: POSTMARKS, badges: BADGES } as const;

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
  const html = view(READY);

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

describe("/collection postmarks", () => {
  const html = view(READY);

  it("heads the section Postmarks with the city count, above Badges", () => {
    expect(html).toMatch(/<h2[^>]*>Postmarks<\/h2>/);
    expect(html).toContain(">4 of 50 cities<");
    expect(html.indexOf(">Postmarks<")).toBeLessThan(html.indexOf(">Badges<"));
  });

  it("draws each stamp with PIGEON POST, its date and its place", () => {
    const stamps = [
      ...html.matchAll(
        /<svg[^>]*aria-label="(Postmark from [^"]+)"[^>]*>(.*?)<\/svg>/g,
      ),
    ];
    expect(stamps.map((m) => m[1])).toEqual([
      "Postmark from Philadelphia, PA, November 19",
      "Postmark from Boston, MA, November 12",
      "Postmark from Hoboken, NJ, November 9",
      "Postmark from Chicago, IL, November 2",
    ]);
    const texts = stamps.map((m) =>
      [...m[2].matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((t) => t[1]),
    );
    expect(texts[0]).toEqual(["PIGEON POST", "NOV 19", "PHILA, PA"]);
    expect(texts[3]).toEqual(["PIGEON POST", "NOV 2", "CHICAGO, IL"]);
  });

  it("shrinks a long place line as drawn", () => {
    expect(html).toMatch(/<text class="[^"]*small[^"]*"[^>]*>PHILA, PA</);
    expect(html).toMatch(/<text class="[^"]*long[^"]*"[^>]*>BOSTON, MA</);
    expect(css).toMatch(/\.long\s*{[^}]*font-size:\s*7px/);
  });

  it("pads with dashed ? slots to a full row plus one", () => {
    const empties = html.match(
      /<li[^>]*><span[^>]*role="img"[^>]*aria-label="Not collected yet"[^>]*>\?<\/span><\/li>/g,
    );
    expect(empties).toHaveLength(4);
    expect(rule("empty")).toMatch(/border:\s*2\.5px dashed #b9b3c9/i);
    expect(rule("empty")).toMatch(/border-radius:\s*50%/);
    expect(rule("empty")).toMatch(/width:\s*70px/);
  });

  it("lays stamps out in four columns, tilted as drawn", () => {
    expect(rule("stamps")).toMatch(
      /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(rule("stamp")).toMatch(/transform:\s*rotate\(-8deg\)/);
    expect(rule("stamp")).toMatch(/width:\s*76px/);
  });

  it("marks only the postmarks earned since the last visit as fresh", () => {
    const slots = html.match(/<li class="[^"]*"/g)?.slice(0, 4) ?? [];
    expect(slots.map((li) => /fresh/.test(li))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("plays coo-stamp once on a fresh postmark, and only when motion is welcome", () => {
    const motion = css.match(
      /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(motion).toMatch(
      /\.fresh\s*{[^}]*animation:\s*coo-stamp 1\.8s cubic-bezier\(0?\.2,\s*1\.6,\s*0?\.4,\s*1\) 1 both/,
    );
    const outside = css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");
    expect(outside).not.toMatch(/\.fresh|animation/);
    expect(css.match(/animation:/g)).toHaveLength(1);
  });

  it("lands the fresh stamp at the same tilt as the others", () => {
    const motion =
      css.match(
        /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/,
      )?.[1] ?? "";
    expect(motion).toMatch(
      /\.fresh \.stamp\s*{[^}]*transform:\s*rotate\(4deg\)/,
    );
  });
});

describe("/collection badges", () => {
  const html = view(READY);

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
    const badges = html.slice(html.indexOf(">Badges<"));
    const kinds = (badges.match(/<li class="[^"]*"/g) ?? []).map((li) =>
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

describe("/collection error", () => {
  const html = view({ kind: "error", message: "Sign in first." });

  it("keeps the header and shows the message with Try again", () => {
    expect(html).toMatch(/<h1[^>]*>Collection<\/h1>/);
    expect(html).toMatch(/<p[^>]*role="alert"[^>]*>Sign in first\.<\/p>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Try again<\/button>/);
    expect(html).not.toContain("Badges");
    expect(html).not.toContain("Postmarks");
  });

  it("keeps Try again a 44 px tap target", () => {
    expect(rule("retry")).toMatch(/min-height:\s*var\(--coo-touch\)/);
  });
});
