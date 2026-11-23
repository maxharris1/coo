import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, src), "utf8");

const ISLAND = 59;
const VIEWPORTS = [
  { name: "iPhone 393x852", height: 852 },
  { name: "iPhone 440x956", height: 956 },
];
const GUTTER = Number(
  readFileSync(new URL("../public/assets/tokens.css", src), "utf8").match(
    /--coo-gutter: (\d+)px;/,
  )![1],
);

type Env = { inset: number; height: number };
type Ref = { file: string; rule: string; prop: string };

function declaration({ file, rule, prop }: Ref) {
  const css = read(file);
  const selector = rule === "body" ? "\\nbody" : `\\.${rule}`;
  const body = css.match(new RegExp(`${selector} \\{([^}]*)\\}`))?.[1];
  if (body === undefined) throw new Error(`no ${rule} rule in ${file}`);
  const v = body.match(new RegExp(`(?:^|\\s)${prop}: ([^;]+);`))?.[1];
  if (v === undefined) throw new Error(`no ${prop} on ${rule} in ${file}`);
  return v.replace(/\s+/g, " ").trim();
}

function firstToken(shorthand: string) {
  let depth = 0;
  for (let i = 0; i < shorthand.length; i++) {
    const c = shorthand[i];
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === " " && depth === 0) return shorthand.slice(0, i);
  }
  return shorthand;
}

function px(expr: string, { inset, height }: Env) {
  const arithmetic = expr
    .replace(/env\(safe-area-inset-top, 0px\)/g, `${inset}px`)
    .replace(/var\(--coo-safe-top\)/g, `${inset}px`)
    .replace(/var\(--coo-safe-\w+(?:, 0px)?\)/g, "0px")
    .replace(/env\(safe-area-inset-\w+(?:, 0px)?\)/g, "0px")
    .replace(/var\(--coo-gutter\)/g, `${GUTTER}px`)
    .replace(/(\d+(?:\.\d+)?)dvh/g, (_, n) => `${(+n * height) / 100}px`)
    .replace(/(\d+(?:\.\d+)?)px/g, "$1")
    .replace(/calc\(/g, "(");
  if (!/^(?:[\d\s.+\-*/(),]|max|min)*$/.test(arithmetic)) {
    throw new Error(`cannot evaluate ${expr}`);
  }
  return Function(
    `return ${arithmetic.replace(/\b(max|min)\(/g, "Math.$1(")};`,
  )() as number;
}

const top = (ref: Ref, env: Env) => px(firstToken(declaration(ref)), env);

const BODY: Ref = { file: "app/globals.css", rule: "body", prop: "padding" };

type Row = {
  screen: string;
  file: string;
  chain: Ref[];
  bleed?: Ref[];
  sticky?: Ref;
  tracker?: Ref;
};

const at = (file: string, rule: string, prop: string): Ref => ({
  file,
  rule,
  prop,
});

function bleedingHero(screen: string, file: string, box: string, pad = box) {
  const bleed = [BODY, at(file, box, "margin-top")];
  return {
    screen,
    file,
    bleed,
    chain: [...bleed, at(file, pad, "padding")],
  };
}

function mapTracker(screen: string, file: string): Row {
  const bleed = [BODY, at(file, "tracker", "margin-top")];
  return {
    screen,
    file,
    bleed,
    chain: [...bleed, at(file, "top", "top")],
    tracker: at(file, "tracker", "height"),
  };
}

const LOFT = "app/(app)/MainTop.module.css";
const SHOP = "app/(app)/shop/ShopTop.module.css";
const BANNER = "app/OfflineBanner.module.css";

const ROWS: Row[] = [
  mapTracker("Flight map header", "components/Tracker.module.css"),
  mapTracker("Odd-job map header", "app/(app)/jobs/[id]/JobTracker.module.css"),
  {
    screen: "Loft wordmark, bell, menu and seeds",
    file: LOFT,
    bleed: [BODY, at(LOFT, "top", "margin-top")],
    chain: [
      BODY,
      at(LOFT, "top", "margin-top"),
      at(LOFT, "top", "padding-top"),
      at(LOFT, "header", "padding"),
    ],
  },
  {
    screen: "Shop title and seed chip",
    file: SHOP,
    bleed: [BODY, at(SHOP, "awning", "margin-top")],
    chain: [
      BODY,
      at(SHOP, "awning", "margin-top"),
      at(SHOP, "awning", "height"),
      at(SHOP, "header", "padding"),
    ],
  },
  bleedingHero(
    "Landed header",
    "app/(app)/sill/Landed.module.css",
    "screen",
    "header",
  ),
  bleedingHero(
    "Takeoff header",
    "app/(app)/send/takeoff/[flightId]/Takeoff.module.css",
    "screen",
    "copy",
  ),
  bleedingHero(
    "Bird hero controls",
    "app/(app)/birds/[id]/page.module.css",
    "hero",
  ),
  bleedingHero(
    "Welcome bird",
    "app/(app)/welcome/bird/page.module.css",
    "page",
  ),
  bleedingHero(
    "Welcome loft",
    "app/(app)/welcome/loft/page.module.css",
    "page",
  ),
  bleedingHero(
    "Welcome install",
    "app/(app)/welcome/install/page.module.css",
    "page",
  ),
  bleedingHero("Sign-in and join", "app/(public)/auth.module.css", "page"),
  bleedingHero("Guest link", "app/(public)/b/[slug]/Guest.module.css", "page"),
  bleedingHero(
    "Guest claim",
    "app/(public)/b/[slug]/GuestClaim.module.css",
    "hero",
  ),
  {
    screen: "/send/new back button and title",
    file: "app/(app)/send/new/NewRecipient.module.css",
    chain: [
      BODY,
      at("app/(app)/send/new/NewRecipient.module.css", "screen", "padding"),
    ],
  },
  {
    screen: "Toasts",
    file: "components/Toasts.module.css",
    chain: [at("components/Toasts.module.css", "stack", "top")],
  },
  {
    screen: "Offline banner",
    file: BANNER,
    chain: [BODY],
    sticky: at(BANNER, "line", "top"),
  },
];

const sum = (refs: Ref[], env: Env) =>
  refs.reduce((y, ref) => y + top(ref, env), 0);

function controlTop(row: Row, env: Env) {
  const inFlow = sum(row.chain, env);
  return row.sticky ? Math.min(inFlow, top(row.sticky, env)) : inFlow;
}

const CASES = ROWS.flatMap((row) =>
  VIEWPORTS.map((viewport) => ({
    ...row,
    viewport: viewport.name,
    height: viewport.height,
  })),
);

describe.each(CASES)("$screen on $viewport", (row) => {
  const island = { inset: ISLAND, height: row.height };
  const desktop = { inset: 0, height: row.height };

  it(`sits entirely below a ${ISLAND}px status-bar inset`, () => {
    expect(controlTop(row, island)).toBeGreaterThanOrEqual(ISLAND);
  });

  it("keeps at least the 16px gutter when the inset is 0", () => {
    expect(controlTop(row, desktop)).toBeGreaterThanOrEqual(
      row.sticky ? 0 : GUTTER,
    );
  });

  it("moves down by exactly the inset, so it is neither padded twice nor missing it", () => {
    expect(controlTop(row, island) - controlTop(row, desktop)).toBe(ISLAND);
  });
});

const ISLAND_AND_DESKTOP = (height: number) => [
  { inset: ISLAND, height },
  { inset: 0, height },
];

describe.each(CASES.filter((row) => row.bleed))(
  "$screen on $viewport",
  (row) => {
    it("still paints its colour up to the screen edge", () => {
      for (const env of ISLAND_AND_DESKTOP(row.height)) {
        expect(sum(row.bleed!, env)).toBeLessThanOrEqual(0);
      }
    });
  },
);

describe.each(CASES.filter((row) => row.tracker))(
  "$screen on $viewport",
  (row) => {
    it("keeps the header inside the map", () => {
      const island = { inset: ISLAND, height: row.height };
      expect(controlTop(row, island)).toBeLessThan(
        sum(row.bleed!, island) + top(row.tracker!, island),
      );
    });
  },
);

describe.each(CASES.filter((row) => row.sticky))(
  "$screen on $viewport",
  (row) => {
    it("sits at the inset in flow and once the page scrolls", () => {
      const island = { inset: ISLAND, height: row.height };
      expect(top(row.sticky!, island)).toBe(ISLAND);
      expect(sum(row.chain, island)).toBe(ISLAND);
    });
  },
);

function cssFiles(dir: URL, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? cssFiles(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`)
      : e.name.endsWith(".css")
        ? [`${prefix}${e.name}`]
        : [],
  );
}

const SRC_CSS = cssFiles(src).map((f) => ({ path: f, css: read(f) }));
const ASSET_CSS = cssFiles(new URL("../public/assets/", src)).map((f) => ({
  path: `public/assets/${f}`,
  css: readFileSync(new URL(`../public/assets/${f}`, src), "utf8"),
}));

describe("status-bar inset source", () => {
  it("reads env(safe-area-inset-top) directly, never through a custom property", () => {
    for (const { path, css } of [...SRC_CSS, ...ASSET_CSS]) {
      expect(css, path).not.toContain("var(--coo-safe-top)");
      expect(css, path).not.toMatch(/--[\w-]+:[^;]*env\(safe-area-inset-top/);
    }
  });

  it("pads the body with the same direct inset the headers use", () => {
    expect(firstToken(declaration(BODY))).toBe("env(safe-area-inset-top, 0px)");
  });

  it("covers every stylesheet that offsets by the top inset", () => {
    const offsetting = SRC_CSS.filter(
      ({ path, css }) =>
        path.endsWith(".module.css") &&
        /safe-area-inset-top|--coo-safe-top/.test(css),
    ).map(({ path }) => path);
    const covered = new Set(ROWS.map((row) => row.file));
    for (const path of offsetting) expect(covered, path).toContain(path);
  });
});
