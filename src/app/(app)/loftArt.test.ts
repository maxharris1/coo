import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normaliseMarkup } from "@/components/normaliseMarkup";
import { config } from "@/lib/config";
import { TOKENS, deck, lights, mix, pyFloat, sky, skyline } from "./loftArt";

const day = config.loft.times.day;
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
    const ours = normaliseMarkup(sky(day, false) + back + near + lights());
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
