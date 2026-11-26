import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normaliseMarkup } from "@/components/normaliseMarkup";
import { config } from "@/lib/config";
import {
  LoftArt,
  TOKENS,
  cart,
  deck,
  grade,
  lights,
  loftArtMarkup,
  mix,
  pyFloat,
  sky,
  skyline,
  type LoftArtProps,
} from "./loftArt";
import type { LoftTime } from "./loftTime";

const { times } = config.loft;
const day = times.day;
const LOOKS: readonly LoftTime[] = [
  "sunrise",
  "day",
  "sunset",
  "dusk",
  "night",
];
const ROOTLESS = { skipRootPresentation: true };
const read = (path: string) => readFileSync(path, "utf8");

describe("mix", () => {
  it("blends sky toward ink the way loft.py does", () => {
    expect(mix("#A9DDF7", "#2A2140", 0.25)).toBe("#89AEC9");
  });

  it("rounds an exact half to even, like Python's round()", () => {
    expect(mix("#000000", "#050505", 0.5)).toBe("#020202");
  });
});

describe("pyFloat", () => {
  it("prints floats the way Python's repr does", () => {
    expect(pyFloat(84)).toBe("84.0");
    expect(pyFloat(55.5)).toBe("55.5");
    expect(pyFloat(-3.5)).toBe("-3.5");
  });

  it("formats fixed digits the way Python's f-strings do", () => {
    expect(pyFloat(0.25, 1)).toBe("0.2");
    expect(pyFloat(-0.25, 1)).toBe("-0.2");
    expect(pyFloat(0.35, 1)).toBe("0.3");
    expect(pyFloat(2.675, 2)).toBe("2.67");
    expect(pyFloat(148, 1)).toBe("148.0");
  });
});

describe("TOKENS", () => {
  const css = read("public/assets/tokens.css");
  const colours = Object.fromEntries(
    [...css.matchAll(/--coo-([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map(
      ([, name, hex]) => [
        name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()),
        hex.toUpperCase(),
      ],
    ),
  );

  it("holds exactly the colour properties in tokens.css", () => {
    expect(Object.keys(colours)).toHaveLength(14);
    expect(TOKENS).toEqual(colours);
  });
});

describe("the day backdrop", () => {
  const ref = normaliseMarkup(
    read("public/assets/loft-reference/start--day.svg"),
    ROOTLESS,
  );

  it("draws sky, skyline and lights exactly as start--day.svg, up to the house", () => {
    const { back, near } = skyline(day);
    const ours = normaliseMarkup(
      (sky(day, false) + back + near).replaceAll("§lit§", TOKENS.sun) +
        lights(undefined, false),
    );
    expect(ours).toEqual(ref.slice(1, 1 + ours.length));
    expect(ref[1 + ours.length]).toBe(
      '<rect fill="#FFC93C" height="80" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" stroke="#2A2140" width="222" x="84.0" y="298">',
    );
  });

  it("draws the deck exactly as the last shapes of start--day.svg", () => {
    const ours = normaliseMarkup(deck());
    expect(ours).toEqual(ref.slice(-1 - ours.length, -1));
  });

  it("adds loft.py's two drifting clouds when asked", () => {
    const bigCloud =
      '<g transform="translate(288 80) scale(0.811)"><g style="animation: coo-drift 30s ease-in-out 0s infinite alternate"><path d="M10 28 q-8 -2 -6 -10 q0 -10 12 -10 q6 -8 18 -5 q12 -3 15 8 q12 0 12 9 q0 8 -9 8 z" fill="#FFFBF0" stroke="#2A2140" stroke-width="3.08" stroke-linejoin="round"/></g></g>';
    const smallCloud =
      '<g transform="translate(338 122) scale(0.459)"><g style="animation: coo-drift 24s ease-in-out 4s infinite alternate"><path d="M10 28 q-8 -2 -6 -10 q0 -10 12 -10 q6 -8 18 -5 q12 -3 15 8 q12 0 12 9 q0 8 -9 8 z" fill="#FFFBF0" stroke="#2A2140" stroke-width="5.44" stroke-linejoin="round"/></g></g>';
    expect(sky(day)).toBe(sky(day, false) + bigCloud + smallCloud);
  });
});

describe("motion.css", () => {
  it("carries loft.py's smoke keyframes", () => {
    expect(read("public/assets/motion.css")).toContain(
      "@keyframes loft-smoke{0%{transform:translate(0,10px) scale(.4);opacity:0}25%{opacity:1}100%{transform:translate(9px,-12px) scale(1.25);opacity:0}}",
    );
  });
});

describe("the espresso cart", () => {
  it("twinkles its two steam wisps with coo-twinkle, the second 0.8 s late", () => {
    const animations = [...cart().matchAll(/style="animation: ([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(animations).toEqual([
      "coo-twinkle 2.4s ease-in-out infinite",
      "coo-twinkle 2.4s ease-in-out .8s infinite",
    ]);
  });

  it("stops twinkling under reduced motion", () => {
    const css = read("public/assets/motion.css");
    expect(css).toContain("@keyframes coo-twinkle");
    expect(css.replace(/\s+/g, "")).toContain(
      "@media(prefers-reduced-motion:reduce){*{animation:none!important",
    );
  });
});

describe("grade", () => {
  it("moves every flat colour toward the tint and keeps ink outlines", () => {
    expect(grade('<a fill="#FFC93C" stroke="#2A2140"/>', "#2C2752", 0.34)).toBe(
      `<a fill="${mix("#FFC93C", "#2C2752", 0.34)}" stroke="#2A2140"/>`,
    );
  });

  it("leaves the markup alone with no tint", () => {
    const svg = '<a fill="#FFC93C"/>';
    expect(grade(svg, null, 0.34)).toBe(svg);
  });
});

const BULB =
  /<g transform="translate\([-\d. ]+\)">((?:<circle [^>]*\/>)?)<rect x="-2\.5" y="0" width="5" height="4" rx="1" fill="#2A2140"\/><path d="M0 3\.5 C5 5 5\.5 11 0 14 C-5\.5 11 -5 5 0 3\.5 Z" fill="(#[0-9A-F]{6})"/g;

const bulbs = (markup: string) =>
  [...markup.matchAll(BULB)].map(([, halo, fill]) => ({ halo, fill }));

describe("string lights", () => {
  const { colors, unlitMixToCard, bulbs: bulbCount } = config.loft.lights;
  const unlit = colors.map((c) => mix(c, TOKENS.card, unlitMixToCard));
  const layouts = [
    { name: "one floor", perches: 3 },
    { name: "two floors", perches: 4 },
  ];

  it("covers every look in the config order", () => {
    expect(LOOKS).toEqual(times.order);
  });

  for (const time of LOOKS) {
    for (const { name, perches } of layouts) {
      it(`${time} on ${name}`, () => {
        const markup = loftArtMarkup({ perches, rooms: [], items: [], time });
        const drawn = bulbs(markup);
        expect(drawn.length).toBeGreaterThan(0);
        if (perches === 3) expect(drawn).toHaveLength(bulbCount);
        if (times[time].lightsOn) {
          for (const { halo, fill } of drawn) {
            expect(halo).toMatch(
              new RegExp(
                `^<circle cy="8" r="12" fill="${fill}" opacity="\\.42" style="animation: coo-twinkle [^"]+"/>$`,
              ),
            );
            expect(colors).toContain(fill);
          }
        } else {
          expect(markup).not.toContain("coo-twinkle");
          expect(drawn.every(({ halo }) => halo === "")).toBe(true);
          if (perches === 3)
            expect(drawn.map(({ fill }) => fill)).toEqual(
              drawn.map((_, i) => unlit[i % unlit.length]),
            );
          for (const { fill } of drawn) expect(unlit).toContain(fill);
        }
      });
    }
  }
});

const CLOUD_FILL = /<path d="M10 28 q-8[^"]*" fill="(#[0-9A-F]{6})"/g;
const STAR = /<path [^>]*fill="#FFFBF0" style="animation: coo-twinkle /g;
const CRESCENT = "M327 77 A17 17 0 1 0 339 100";

describe("sky", () => {
  for (const time of LOOKS) {
    const look = times[time];
    it(time, () => {
      const withClouds = sky(look, true);
      const cloudFills = [...withClouds.matchAll(CLOUD_FILL)].map((m) => m[1]);
      expect(cloudFills.length).toBeGreaterThan(0);
      expect(cloudFills.every((fill) => fill === look.cloud)).toBe(true);
      expect(withClouds).not.toContain("<image");
      expect([...sky(look, false).matchAll(STAR)]).toHaveLength(look.stars);
      if (time === "night") {
        expect(withClouds).not.toContain("translate(288 80)");
        expect(withClouds).toContain(CRESCENT);
        expect(withClouds).toContain(
          '<g opacity=".0" transform="translate(214 58)',
        );
      } else {
        expect(withClouds).not.toContain(CRESCENT);
        expect(withClouds).toContain("translate(288 80)");
      }
    });
  }
});

type Fixture = LoftArtProps & { file: string };

describe("LoftArt matches the loft reference", () => {
  const fixtures = JSON.parse(read("public/assets/loft-reference/index.json"))
    .files as Fixture[];

  for (const { file, perches, rooms, items, time } of fixtures) {
    it(file, () => {
      const ours = renderToStaticMarkup(
        createElement(LoftArt, { perches, rooms, items, time, clouds: false }),
      );
      expect(normaliseMarkup(ours, ROOTLESS)).toEqual(
        normaliseMarkup(read(`public/assets/loft-reference/${file}`), ROOTLESS),
      );
    });
  }

  it("covers every fixture in the index", () => {
    expect(fixtures).toHaveLength(20);
  });

  it("drifts the two clouds in front of the sky when asked", () => {
    const props = { perches: 3, rooms: [], items: [], time: "day" as const };
    expect(loftArtMarkup({ ...props, clouds: true })).toBe(
      loftArtMarkup({ ...props, clouds: false }).replace(
        sky(day, false),
        sky(day),
      ),
    );
  });
});
