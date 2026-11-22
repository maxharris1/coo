import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DOODLE_COLORS, type Doodle, validateDoodle } from "@/lib/game/notes";
import { DoodleView, doodleLabel } from "./DoodleView";

const doodle = (strokes: Doodle["strokes"]): Doodle => {
  const check = validateDoodle({ v: 1, w: 300, h: 200, strokes });
  if (!check.ok) throw new Error(check.reason);
  return check.doodle;
};

const INK = doodle([
  {
    color: "ink",
    width: "marker",
    points: [
      [10, 20],
      [30, 40],
      [55, 41],
    ],
  },
]);

const render = (d: Doodle) => renderToStaticMarkup(<DoodleView doodle={d} />);

const paths = (html: string) =>
  [...html.matchAll(/<path[^>]*>/g)].map((m) => m[0]);

const pathPoints = (tag: string) =>
  [...tag.match(/ d="([^"]+)"/)![1].matchAll(/[ML](\d+) (\d+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);

const hexToLuminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe("DoodleView", () => {
  it("draws an SVG sized from the doodle in the ink marker style", () => {
    const html = render(INK);
    expect(html).toMatch(/^<svg [^>]*viewBox="0 0 300 200"/);
    expect(html).toContain('fill="none"');
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-linejoin="round"');
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("draws the stored points exactly, with no wobble added at render time", () => {
    const [path] = paths(render(INK));
    expect(pathPoints(path)).toEqual(INK.strokes[0].points);
    expect(path).toContain("var(--coo-ink)");
  });

  it("outlines sun, sky and mint with a wider ink stroke underneath", () => {
    for (const color of ["sun", "sky", "mint"] as const) {
      const d = doodle([
        {
          color,
          width: "fine",
          points: [
            [1, 2],
            [100, 120],
          ],
        },
      ]);
      const [under, over] = paths(render(d));
      expect(under).toContain("var(--coo-ink)");
      expect(over).toContain(`var(--coo-${color})`);
      expect(pathPoints(under)).toEqual(pathPoints(over));
      const width = (tag: string) =>
        Number(tag.match(/stroke-width="([\d.]+)"/)![1]);
      expect(width(under)).toBeGreaterThan(width(over));
    }
  });

  it("does not outline ink, stamp or tomato", () => {
    for (const color of ["ink", "stamp", "tomato"] as const) {
      const d = doodle([
        {
          color,
          width: "marker",
          points: [
            [1, 2],
            [100, 120],
          ],
        },
      ]);
      expect(paths(render(d))).toHaveLength(1);
    }
  });

  it("outlines every colour without 3:1 contrast on the card", () => {
    const tokens = readFileSync(
      new URL("../../../public/assets/tokens.css", import.meta.url),
      "utf8",
    );
    const hex = (name: string) =>
      tokens.match(new RegExp(`--coo-${name}:\\s*(#[0-9A-Fa-f]{6})`))![1];
    const card = hexToLuminance(hex("card"));
    for (const color of DOODLE_COLORS) {
      const contrast = (card + 0.05) / (hexToLuminance(hex(color)) + 0.05);
      const d = doodle([
        {
          color,
          width: "marker",
          points: [
            [1, 2],
            [9, 9],
          ],
        },
      ]);
      const outlined = paths(render(d)).length === 2;
      expect(outlined || contrast >= 3, color).toBe(true);
    }
  });

  it("keeps both widths a chunky felt tip", () => {
    for (const width of ["fine", "marker"] as const) {
      const d = doodle([
        {
          color: "ink",
          width,
          points: [
            [1, 2],
            [100, 120],
          ],
        },
      ]);
      const w = Number(render(d).match(/stroke-width="([\d.]+)"/)![1]);
      expect(w, width).toBeGreaterThanOrEqual(5);
    }
  });

  it("draws a single-point stroke as a dot", () => {
    const html = render(
      doodle([
        { color: "ink", width: "marker", points: [[40, 50]] },
        { color: "sky", width: "fine", points: [[80, 90]] },
      ]),
    );
    const dots = [...html.matchAll(/<circle[^>]*>/g)].map((m) => m[0]);
    expect(dots).toHaveLength(3);
    expect(dots[0]).toMatch(/cx="40" cy="50"/);
    expect(dots[1]).toMatch(/cx="80" cy="90"[^>]*var\(--coo-ink\)/);
    expect(dots[2]).toMatch(/cx="80" cy="90"[^>]*var\(--coo-sky\)/);
  });

  it("paints only with --coo token colours and no hex", () => {
    const html = render(
      doodle(
        DOODLE_COLORS.map((color, i) => ({
          color,
          width: "marker" as const,
          points: [
            [i * 10, 5],
            [i * 10 + 5, 100],
          ] as [number, number][],
        })),
      ),
    );
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    const paints = [...html.matchAll(/(?:stroke|fill):\s*([^;"]+)/g)].map(
      (m) => m[1],
    );
    expect(paints.length).toBeGreaterThan(0);
    for (const paint of paints) {
      expect(paint).toMatch(/^var\(--coo-(ink|stamp|tomato|sun|sky|mint)\)$/);
    }
  });

  it("builds markup only from numbers and fixed strings, never client text", () => {
    const evil = {
      v: 1,
      w: 300,
      h: 200,
      strokes: [
        {
          color: '"><script>alert(1)</script>',
          width: '"onload="alert(1)',
          points: [['"/><script>x</script>', 1]],
        },
      ],
    };
    expect(validateDoodle(evil).ok).toBe(false);
    const html = render(
      doodle(
        DOODLE_COLORS.flatMap((color, i) =>
          (["fine", "marker"] as const).map((width) => ({
            color,
            width,
            points: [[i * 40, 7]] as [number, number][],
          })),
        ).concat([
          {
            color: "sky",
            width: "fine",
            points: [
              [1, 2],
              [250, 199],
            ],
          },
        ]),
      ),
    );
    const allowed =
      /^(?:[\d .,MLA-Za-z]*|var\(--coo-[a-z]+\)|(?:stroke|fill):var\(--coo-[a-z]+\))$/;
    for (const [, name, value] of html.matchAll(/ ([a-z-]+)="([^"]*)"/g)) {
      expect(value, name).toMatch(allowed);
    }
    expect(html).not.toMatch(/<(?!\/?(svg|g|path|circle)\b)/);
  });

  it("names a doodle for screen readers by the colours it uses", () => {
    expect(doodleLabel(INK)).toBe("A doodle");
    const mixed = doodle([
      { color: "mint", width: "fine", points: [[1, 1]] },
      { color: "ink", width: "fine", points: [[2, 2]] },
      { color: "tomato", width: "fine", points: [[3, 3]] },
      { color: "mint", width: "fine", points: [[4, 4]] },
    ]);
    expect(doodleLabel(mixed)).toBe("A doodle in ink, tomato, and mint");
    expect(
      doodleLabel(doodle([{ color: "sky", width: "fine", points: [[1, 1]] }])),
    ).toBe("A doodle in sky");
    const html = render(mixed);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="A doodle in ink, tomato, and mint"');
    expect(render(INK)).toContain('aria-label="A doodle"');
  });
});
