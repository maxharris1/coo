import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, src), "utf8");

const SAFE_TOP = "env(safe-area-inset-top, 0px)";
const BLEED = `calc(-1 * ${SAFE_TOP})`;
const INSET = String.raw`(?:var\(--coo-safe-\w+\)|env\(safe-area-inset-\w+, 0px\))`;

const SIDES = ["right", "bottom", "left"] as const;
const inset = (side: string) => `var(--coo-safe-${side})`;
const bleed = (side: string) => `calc(-1 * ${inset(side)})`;

const PAGE_PAD =
  "calc(28px + env(safe-area-inset-top, 0px)) calc(var(--coo-gutter) + var(--coo-safe-right)) calc(20px + var(--coo-safe-bottom)) calc(var(--coo-gutter) + var(--coo-safe-left))";

const PAGES = [
  "app/(public)/auth.module.css",
  "app/(app)/welcome/bird/page.module.css",
  "app/(app)/welcome/loft/page.module.css",
  "app/(app)/welcome/install/page.module.css",
];

const SHEETS = [
  "app/(app)/friends/FriendSheet.module.css",
  "app/(app)/settings/SettingsSheet.module.css",
  "app/(app)/welcome/install/InstallSheet.module.css",
];

type Pad = { rule: string; prop: string; now: string; before: string };

const HEROES: { file: string; box: string; pads: Pad[] }[] = [
  {
    file: "app/(app)/sill/Landed.module.css",
    box: "screen",
    pads: [
      {
        rule: "header",
        prop: "padding",
        now: "calc(var(--coo-gutter) + env(safe-area-inset-top, 0px)) var(--coo-gutter) 0",
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
        now: "calc(36px + env(safe-area-inset-top, 0px)) 20px 0",
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
        now: "calc(var(--coo-gutter) + env(safe-area-inset-top, 0px)) var(--coo-gutter) 0",
        before: "var(--coo-gutter) var(--coo-gutter) 0",
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
        now: "calc(28px + env(safe-area-inset-top, 0px)) calc(var(--coo-gutter) + var(--coo-safe-right)) calc(12px + var(--coo-safe-bottom)) calc(var(--coo-gutter) + var(--coo-safe-left))",
        before: "28px var(--coo-gutter) 12px var(--coo-gutter)",
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
        now: PAGE_PAD,
        before: "28px var(--coo-gutter) 20px var(--coo-gutter)",
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
        now: PAGE_PAD,
        before: "28px var(--coo-gutter) 20px var(--coo-gutter)",
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
        now: "calc(22px + env(safe-area-inset-top, 0px)) var(--coo-gutter) calc(8px + var(--coo-safe-bottom))",
        before: "22px var(--coo-gutter) 8px",
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
        now: "calc(22px + env(safe-area-inset-top, 0px)) var(--coo-gutter) 0 20px",
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
  if (new RegExp(`^calc\\(-1 \\* ${INSET}\\)$`).test(v) || v === SAFE_TOP) {
    return "0px";
  }
  return v
    .replace(new RegExp(` \\+ ${INSET}\\)`, "g"), ")")
    .replace(/calc\((\d+px|var\(--[\w-]+\))\)/g, "$1");
}

function atInset(v: string | undefined, px: number) {
  return v
    ?.replace(new RegExp(INSET, "g"), `${px}px`)
    .replace(/calc\(-1 \* (\d+)px\)/g, (_, n) => `${-n}px`)
    .replace(/calc\((\d+)px \+ (\d+)px\)/g, (_, a, b) => `${+a + +b}px`);
}

const count = (text: string, part: string) => text.split(part).length - 1;

const LEFT_RIGHT = ["right", "left"] as const;
const sidePad = (vertical: string) =>
  `${vertical} calc(20px + ${inset("right")}) 0 calc(20px + ${inset("left")})`;

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
    expect(value(top, "padding-top")).toBe("env(safe-area-inset-top, 0px)");
  });

  it.each(LEFT_RIGHT)("bleeds the sky into the %s safe area", (side) => {
    expect(value(top, `margin-${side}`)).toBe(bleed(side));
  });

  it("keeps side padding off the sky, so the scene reaches the screen edge", () => {
    expect(top).not.toMatch(/(?:^|\s)padding(?:-left|-right)?:/);
  });

  it("pads the header and greeting 20px inside each side inset", () => {
    expect(value(rule(css, "header"), "padding")).toBe(sidePad("20px"));
    expect(value(rule(css, "greeting"), "padding")).toBe(sidePad("10px"));
  });

  it.each(LEFT_RIGHT)(
    "uses the %s inset once per rule, so nothing is padded twice",
    (side) => {
      for (const name of ["top", "header", "greeting"]) {
        expect(count(rule(css, name), inset(side))).toBe(1);
      }
      expect(count(css, inset(side))).toBe(3);
    },
  );

  it("moves the sky out and the controls in by a 16px side inset", () => {
    expect(atInset(value(top, "margin-left"), 16)).toBe("-16px");
    expect(atInset(value(top, "margin-right"), 16)).toBe("-16px");
    expect(atInset(value(rule(css, "header"), "padding"), 16)).toBe(
      "20px 36px 0 36px",
    );
    expect(atInset(value(rule(css, "greeting"), "padding"), 16)).toBe(
      "10px 36px 0 36px",
    );
  });

  it("lays out as before when the inset is 0", () => {
    expect(withoutInsets(value(top, "margin-top"))).toBe("0px");
    expect(withoutInsets(value(top, "padding-top"))).toBe("0px");
    for (const side of LEFT_RIGHT) {
      expect(withoutInsets(value(top, `margin-${side}`))).toBe("0px");
    }
    expect(withoutInsets(value(rule(css, "header"), "padding"))).toBe(
      "20px 20px 0 20px",
    );
    expect(withoutInsets(value(rule(css, "greeting"), "padding"))).toBe(
      "10px 20px 0 20px",
    );
  });
});

describe("Shop awning", () => {
  const css = read("app/(app)/shop/ShopTop.module.css");
  const awning = rule(css, "awning");

  it("pulls the stripes up under the status bar and grows by the inset", () => {
    expect(value(awning, "margin-top")).toBe(BLEED);
    expect(value(awning, "height")).toBe(
      "calc(30px + env(safe-area-inset-top, 0px))",
    );
  });

  it("keeps the title and balance below the awning", () => {
    expect(value(rule(css, "header"), "padding")).toBe(
      "12px var(--coo-gutter) 0",
    );
  });

  it.each(LEFT_RIGHT)("bleeds the stripes into the %s safe area", (side) => {
    expect(value(awning, `margin-${side}`)).toBe(bleed(side));
  });

  it("is 30px tall with no offset when the inset is 0", () => {
    expect(withoutInsets(value(awning, "height"))).toBe("30px");
    expect(withoutInsets(value(awning, "margin-top"))).toBe("0px");
    for (const side of LEFT_RIGHT) {
      expect(withoutInsets(value(awning, `margin-${side}`))).toBe("0px");
    }
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

describe.each(PAGES)("%s page shell", (file) => {
  const css = read(file);
  const page = rule(css, "page");
  const pad = value(page, "padding")!;

  it.each(SIDES)("bleeds into the %s safe area", (side) => {
    expect(value(page, `margin-${side}`)).toBe(bleed(side));
  });

  it.each(SIDES)(
    "pads the %s inset back exactly once, so nothing is padded twice",
    (side) => {
      expect(count(pad, inset(side))).toBe(1);
      expect(count(css, inset(side))).toBe(2);
    },
  );

  it("lays out with no side or bottom offset when the insets are 0", () => {
    for (const side of SIDES) {
      expect(withoutInsets(value(page, `margin-${side}`))).toBe("0px");
    }
    expect(page).not.toMatch(/(?:^|\s)margin:/);
  });
});

describe.each(SHEETS)("%s bottom sheet", (file) => {
  const css = read(file);
  const pad = value(rule(css, "sheet"), "padding");

  it("pads the sheet 16px past the bottom inset", () => {
    expect(pad).toBe(
      "10px var(--coo-gutter) calc(16px + var(--coo-safe-bottom))",
    );
  });

  it("uses the bottom inset exactly once and never bleeds, since the sheet floats over the page", () => {
    expect(count(css, inset("bottom"))).toBe(1);
    expect(css).not.toContain(BLEED);
    expect(css).not.toContain(inset("right"));
    expect(css).not.toContain(inset("left"));
  });

  it("lays out as before when the inset is 0", () => {
    expect(withoutInsets(pad)).toBe("10px var(--coo-gutter) 16px");
  });
});

describe("side and bottom bleed guard", () => {
  const bleedingInto = (side: string) =>
    moduleFiles("")
      .filter((f) => read(f).includes(bleed(side)))
      .sort();

  it.each(LEFT_RIGHT)(
    "bleeds the %s inset only on the page shells, the Loft top and the Shop awning",
    (side) => {
      expect(bleedingInto(side)).toEqual(
        [
          ...PAGES,
          "app/(app)/MainTop.module.css",
          "app/(app)/shop/ShopTop.module.css",
        ].sort(),
      );
    },
  );

  it("bleeds the bottom inset only on the page shells", () => {
    expect(bleedingInto("bottom")).toEqual([...PAGES].sort());
  });
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

  it("keeps the Loft flock on the cream gutter with no side bleed", () => {
    const flock = rule(read("app/(app)/Flock.module.css"), "flock");
    expect(value(flock, "padding")).toBe(
      "var(--coo-gutter) var(--coo-gutter) 24px",
    );
    expect(flock).not.toMatch(/margin-(?:left|right)|safe-(?:left|right)/);
  });

  it("keeps the app shell cream with no top offset", () => {
    const shell = read("components/AppShell.module.css");
    expect(value(rule(shell, "column"), "background")).toBe("var(--coo-paper)");
    expect(shell).not.toMatch(/padding-top|margin-top|safe-top/);
  });

  it("keeps the body padded on all four sides, a 430px column from 600px up", () => {
    const css = read("app/globals.css");
    const body = css.match(/\nbody \{([^}]*)\}/)![1];
    const desktop = css.match(
      /@media \(min-width: 600px\) \{\s*body \{([^}]*)\}/,
    )![1];
    expect(value(desktop, "max-width")).toBe("430px");
    expect(value(body, "background")).toBe("var(--coo-paper)");
    expect(body).toMatch(
      /padding: env\(safe-area-inset-top, 0px\) env\(safe-area-inset-right, 0px\)\s+env\(safe-area-inset-bottom, 0px\) env\(safe-area-inset-left, 0px\);/,
    );
  });
});
