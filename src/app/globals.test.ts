import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const fontFaces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
const fontDir = new URL("../../public/assets/fonts/", import.meta.url);

describe("globals.css", () => {
  it("declares every packet font file once, with font-display swap", () => {
    const files = readdirSync(fontDir).filter((f) => f.endsWith(".woff2"));
    const urls = fontFaces.map((rule) => /url\("?([^")]+)"?\)/.exec(rule)?.[1]);

    expect(files).toHaveLength(7);
    expect(urls.sort()).toEqual(files.map((f) => `/assets/fonts/${f}`).sort());
    for (const rule of fontFaces) expect(rule).toMatch(/font-display:\s*swap/);
  });

  it("types no raw colour, only token variables", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it("draws the focus ring as a 3px tomato outline with a 2px offset", () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/outline:\s*3px solid var\(--coo-tomato\)/);
    expect(rule).toMatch(/outline-offset:\s*2px/);
  });

  it("paints the html canvas paper in the light scheme by default", () => {
    const rule = /^html \{([^}]*)\}/m.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/background:\s*var\(--coo-paper\)/);
    expect(rule).toMatch(/color-scheme:\s*light/);
  });

  it.each([
    ["sun", "--coo-sun"],
    ["sky", "--coo-sky"],
  ])(
    "fills html and body with the %s canvas on phone widths only",
    (canvas, token) => {
      const phone = media(css, "max-width: 599.98px");
      const selector = `html[data-canvas="${canvas}"]`;
      const rule = new RegExp(
        `${escape(selector)},\\s*${escape(selector)} body\\s*\\{([^}]*)\\}`,
      ).exec(phone)?.[1];
      expect(rule).toMatch(new RegExp(`background:\\s*var\\(${token}\\)`));
      expect(css.split(selector)).toHaveLength(3);
    },
  );

  it("lets the body fill the screen on phones, with no column cap", () => {
    const rule = /^body \{([^}]*)\}/m.exec(css)?.[1] ?? "";
    expect(rule).not.toMatch(/max-width/);
    expect(rule).not.toMatch(/margin:\s*0 auto/);
    expect(rule).toMatch(/background:\s*var\(--coo-paper\)/);
  });

  it("keeps the body a paper column 430px wide from 600px up", () => {
    const rule =
      /^\s*body \{([^}]*)\}/m.exec(media(css, "min-width: 600px"))?.[1] ?? "";
    expect(rule).toMatch(/max-width:\s*430px/);
    expect(rule).toMatch(/margin:\s*0 auto/);
  });

  it("splits phone and desktop at one 600px breakpoint", () => {
    const queries = [
      ...css.matchAll(/@media \(((?:min|max)-width): ([\d.]+)px\)/g),
    ];
    expect(queries.map(([, kind, px]) => `${kind} ${px}`).sort()).toEqual([
      "max-width 599.98",
      "min-width 600",
    ]);
  });

  it.each([
    [440, true],
    [431, true],
    [599, true],
    [599.98, true],
    [390, true],
    [600, false],
    [744, false],
    [1280, false],
  ])("at %spx wide the body fills the screen: %s", (width, phone) => {
    const body = bodyAt(css, width);
    expect(body["max-width"]).toBe(phone ? undefined : "430px");
    expect(body.margin).toBe(phone ? "0" : "0 auto");
  });

  it.each(Array.from({ length: 169 }, (_, i) => 431 + i))(
    "fills the screen with the body at %spx wide",
    (width) => {
      expect(bodyAt(css, width)["max-width"]).toBeUndefined();
      expect(mediaApplies("max-width: 599.98px", width)).toBe(true);
    },
  );

  it("caps the tab bar at 430px only from 600px up", () => {
    const tabBar = readFileSync(
      new URL("../components/TabBar.module.css", import.meta.url),
      "utf8",
    );
    const bar = /^\.bar \{([^}]*)\}/m.exec(tabBar)?.[1] ?? "";
    expect(bar).toMatch(/width:\s*100%/);
    expect(bar).not.toMatch(/430px/);
    expect(media(tabBar, "min-width: 600px")).toMatch(
      /\.bar \{[^}]*max-width:\s*430px/,
    );
  });

  it("never sizes app or component styles to 100vw", () => {
    const root = new URL("../", import.meta.url);
    const offenders = ["app", "components"]
      .flatMap((dir) =>
        (readdirSync(new URL(dir, root), { recursive: true }) as string[]).map(
          (f) => `${dir}/${f}`,
        ),
      )
      .filter((f) => f.endsWith(".css") && !f.startsWith("app/dev/"))
      .filter((f) => readFileSync(new URL(f, root), "utf8").includes("100vw"));
    expect(offenders).toEqual([]);
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function media(sheet: string, query: string): string {
  return (
    new RegExp(
      `@media \\(${escape(query)}\\) \\{((?:[^{}]*\\{[^}]*\\})*)\\s*\\}`,
    ).exec(sheet)?.[1] ?? ""
  );
}

function mediaApplies(query: string, width: number): boolean {
  const [, kind, px] = /^(min|max)-width: ([\d.]+)px$/.exec(query)!;
  return kind === "min" ? width >= Number(px) : width <= Number(px);
}

function bodyAt(sheet: string, width: number): Record<string, string> {
  const blocks = [/^body \{([^}]*)\}/m.exec(sheet)?.[1] ?? ""];
  for (const [, query, inner] of sheet.matchAll(
    /@media \(((?:min|max)-width: [\d.]+px)\) \{((?:[^{}]*\{[^}]*\})*)\s*\}/g,
  )) {
    if (!mediaApplies(query, width)) continue;
    const body = /(?:^|\})\s*body \{([^}]*)\}/.exec(inner)?.[1];
    if (body) blocks.push(body);
  }
  const decls: Record<string, string> = {};
  for (const block of blocks)
    for (const [, prop, value] of block.matchAll(/([\w-]+):\s*([^;]+);/g))
      decls[prop] = value.trim().replace(/\s+/g, " ");
  return decls;
}
