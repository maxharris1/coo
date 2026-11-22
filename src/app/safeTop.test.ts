import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, src), "utf8");

const SAFE_TOP = "var(--coo-safe-top)";
const BLEED = `calc(-1 * ${SAFE_TOP})`;

type Pad = { rule: string; prop: string; now: string; before: string };

const HEROES: { file: string; box: string; pads: Pad[] }[] = [
  {
    file: "app/(app)/sill/Landed.module.css",
    box: "screen",
    pads: [
      {
        rule: "header",
        prop: "padding",
        now: "calc(var(--coo-gutter) + var(--coo-safe-top)) var(--coo-gutter) 0",
        before: "var(--coo-gutter) var(--coo-gutter) 0",
      },
    ],
  },
  {
    file: "app/(app)/send/takeoff/[flightId]/Takeoff.module.css",
    box: "screen",
    pads: [
      {
        rule: "copy",
        prop: "padding",
        now: "calc(36px + var(--coo-safe-top)) 20px 0",
        before: "36px 20px 0",
      },
    ],
  },
  {
    file: "app/(app)/birds/[id]/page.module.css",
    box: "hero",
    pads: [
      {
        rule: "hero",
        prop: "padding",
        now: "calc(var(--coo-gutter) + var(--coo-safe-top)) var(--coo-gutter) 0",
        before: "var(--coo-gutter) var(--coo-gutter) 0",
      },
    ],
  },
  {
    file: "components/Tracker.module.css",
    box: "tracker",
    pads: [
      {
        rule: "tracker",
        prop: "height",
        now: "calc(100dvh - 84px - var(--coo-safe-bottom, 0px) + var(--coo-safe-top))",
        before: "calc(100dvh - 84px - var(--coo-safe-bottom, 0px))",
      },
      {
        rule: "top",
        prop: "top",
        now: "calc(var(--coo-gutter) + var(--coo-safe-top))",
        before: "var(--coo-gutter)",
      },
    ],
  },
  {
    file: "app/(app)/welcome/install/page.module.css",
    box: "page",
    pads: [
      {
        rule: "page",
        prop: "padding",
        now: "calc(28px + var(--coo-safe-top)) var(--coo-gutter) calc(12px + var(--coo-safe-bottom))",
        before: "28px var(--coo-gutter) calc(12px + var(--coo-safe-bottom))",
      },
    ],
  },
  ...["welcome/bird", "welcome/loft"].map((dir) => ({
    file: `app/(app)/${dir}/page.module.css`,
    box: "page",
    pads: [
      {
        rule: "page",
        prop: "padding",
        now: "calc(28px + var(--coo-safe-top)) var(--coo-gutter) 20px",
        before: "28px var(--coo-gutter) 20px",
      },
    ],
  })),
  {
    file: "app/(public)/auth.module.css",
    box: "page",
    pads: [
      {
        rule: "page",
        prop: "padding",
        now: "calc(28px + var(--coo-safe-top)) var(--coo-gutter) 20px",
        before: "28px var(--coo-gutter) 20px",
      },
    ],
  },
  {
    file: "app/(public)/b/[slug]/Guest.module.css",
    box: "page",
    pads: [
      {
        rule: "page",
        prop: "padding",
        now: "calc(22px + var(--coo-safe-top)) var(--coo-gutter) calc(8px + var(--coo-safe-bottom))",
        before: "22px var(--coo-gutter) calc(8px + var(--coo-safe-bottom))",
      },
    ],
  },
  {
    file: "app/(public)/b/[slug]/GuestClaim.module.css",
    box: "hero",
    pads: [
      {
        rule: "hero",
        prop: "padding",
        now: "calc(22px + var(--coo-safe-top)) var(--coo-gutter) 0 20px",
        before: "22px var(--coo-gutter) 0 20px",
      },
    ],
  },
];

const BLEEDS: Record<string, string> = {
  "app/(app)/MainTop.module.css": "top",
  "app/(app)/shop/ShopTop.module.css": "awning",
  ...Object.fromEntries(HEROES.map((h) => [h.file, h.box])),
};

function rule(css: string, name: string) {
  const body = css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1];
  if (body === undefined) throw new Error(`no .${name} rule`);
  return body;
}

const value = (body: string, prop: string) =>
  body
    .match(new RegExp(`(?:^|\\s)${prop}: ([^;]+);`))?.[1]
    .replace(/\s+/g, " ")
    .replace(/\( | \)/g, (m) => m.trim());

function withoutInsets(v: string | undefined) {
  if (v === undefined) return undefined;
  if (v === BLEED || v === SAFE_TOP) return "0px";
  return v
    .replaceAll(" + var(--coo-safe-top))", ")")
    .replace(/calc\((\d+px|var\(--[\w-]+\))\)/g, "$1");
}

const count = (text: string, part: string) => text.split(part).length - 1;

function moduleFiles(dir: string): string[] {
  return readdirSync(new URL(dir, src), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? moduleFiles(`${dir}${e.name}/`)
      : e.name.endsWith(".module.css")
        ? [`${dir}${e.name}`]
        : [],
  );
}

describe("Loft top", () => {
  const css = read("app/(app)/MainTop.module.css");
  const top = rule(css, "top");

  it("pulls the sky up under the status bar", () => {
    expect(value(top, "margin-top")).toBe(BLEED);
    expect(value(top, "background")).toBe("var(--coo-sky)");
  });

  it("pads the header back down by the same inset, so the controls clear the notch", () => {
    expect(value(top, "padding-top")).toBe("var(--coo-safe-top)");
    expect(value(rule(css, "header"), "padding")).toBe("20px 20px 0");
  });

  it("lays out as before when the inset is 0", () => {
    expect(withoutInsets(value(top, "margin-top"))).toBe("0px");
    expect(withoutInsets(value(top, "padding-top"))).toBe("0px");
  });
});

describe("Shop awning", () => {
  const css = read("app/(app)/shop/ShopTop.module.css");
  const awning = rule(css, "awning");

  it("pulls the stripes up under the status bar and grows by the inset", () => {
    expect(value(awning, "margin-top")).toBe(BLEED);
    expect(value(awning, "height")).toBe("calc(30px + var(--coo-safe-top))");
  });

  it("keeps the title and balance below the awning", () => {
    expect(value(rule(css, "header"), "padding")).toBe(
      "12px var(--coo-gutter) 0",
    );
  });

  it("is 30px tall with no offset when the inset is 0", () => {
    expect(withoutInsets(value(awning, "height"))).toBe("30px");
    expect(withoutInsets(value(awning, "margin-top"))).toBe("0px");
  });
});

describe.each(HEROES)("$file", ({ file, box, pads }) => {
  const css = read(file);

  it(`pulls .${box} up under the status bar`, () => {
    expect(value(rule(css, box), "margin-top")).toBe(BLEED);
  });

  it.each(pads)("pads .$rule $prop back down by the inset", (pad) => {
    expect(value(rule(css, pad.rule), pad.prop)).toBe(pad.now);
  });

  it("uses the safe-top inset exactly once past the bleed, so nothing is padded twice", () => {
    expect(count(css, SAFE_TOP)).toBe(1 + pads.length);
    for (const pad of pads) {
      expect(count(value(rule(css, pad.rule), pad.prop)!, SAFE_TOP)).toBe(1);
    }
  });

  it.each(pads)(
    "lays .$rule $prop out as before when the inset is 0",
    (pad) => {
      expect(withoutInsets(value(rule(css, pad.rule), pad.prop))).toBe(
        pad.before,
      );
      expect(withoutInsets(value(rule(css, box), "margin-top"))).toBe("0px");
    },
  );
});

describe("cream guard", () => {
  it("bleeds only the listed coloured tops", () => {
    const bleeding = moduleFiles("")
      .filter((f) => read(f).includes(BLEED))
      .sort();
    expect(bleeding).toEqual(Object.keys(BLEEDS).sort());
    for (const [file, name] of Object.entries(BLEEDS)) {
      expect(read(file).split(BLEED)).toHaveLength(2);
      expect(value(rule(read(file), name), "margin-top")).toBe(BLEED);
    }
  });

  it("keeps the app shell cream with no top offset", () => {
    const shell = read("components/AppShell.module.css");
    expect(value(rule(shell, "column"), "background")).toBe("var(--coo-paper)");
    expect(shell).not.toMatch(/padding-top|margin-top|safe-top/);
  });

  it("keeps the body padded on all four sides in the 430px column", () => {
    const body = read("app/globals.css").match(/\nbody \{([^}]*)\}/)![1];
    expect(value(body, "max-width")).toBe("430px");
    expect(value(body, "background")).toBe("var(--coo-paper)");
    expect(body).toMatch(
      /padding: var\(--coo-safe-top\) var\(--coo-safe-right\) var\(--coo-safe-bottom\)\s+var\(--coo-safe-left\);/,
    );
  });
});
