import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Bird,
  GEAR_IDS,
  LOOKS,
  POSES,
  type GearId,
  type Look,
  type Pose,
} from "./Bird";
import { normaliseMarkup } from "./normaliseMarkup";

const ROOT = join(__dirname, "..", "..");
const REF = join(ROOT, "public", "assets", "rig-reference");

type Fixture = {
  file: string;
  look: string;
  pose: string;
  gear: string[];
  animated: boolean;
};
const fixtures: Fixture[] = JSON.parse(
  readFileSync(join(REF, "index.json"), "utf8"),
).files;

type Point = { x: number; y: number };

function applyTransform(list: string, pt: Point): Point {
  const ops = [...list.matchAll(/(\w+)\(([^)]*)\)/g)].map(([, op, args]) => ({
    op,
    n: args
      .trim()
      .split(/[\s,]+/)
      .map(Number),
  }));
  return ops.reduceRight(({ x, y }, { op, n }) => {
    if (op === "translate") return { x: x + n[0], y: y + (n[1] ?? 0) };
    if (op === "scale") return { x: x * n[0], y: y * (n[1] ?? n[0]) };
    if (op === "rotate") {
      const [a, cx = 0, cy = 0] = n;
      const r = (a * Math.PI) / 180;
      const dx = x - cx,
        dy = y - cy;
      return {
        x: cx + dx * Math.cos(r) - dy * Math.sin(r),
        y: cy + dx * Math.sin(r) + dy * Math.cos(r),
      };
    }
    throw new Error(`unsupported transform ${op}`);
  }, pt);
}

function objective(html: string): Point {
  const core = html.match(/<circle[^>]*fill="#C8F8D4"[^>]*>/);
  if (!core) throw new Error("no night-vision objective drawn");
  const at = core.index!;
  const attr = (name: string) =>
    Number(core[0].match(new RegExp(` ${name}="([^"]+)"`))![1]);
  const stack: string[] = [];
  for (const tag of html.slice(0, at).matchAll(/<(\/?)g\b([^>]*)>/g)) {
    if (tag[1]) stack.pop();
    else stack.push(tag[2].match(/ transform="([^"]+)"/)?.[1] ?? "");
  }
  return stack.reduceRight((pt, t) => applyTransform(t, pt), {
    x: attr("cx"),
    y: attr("cy"),
  });
}

const ROOTLESS = { skipRootPresentation: true };

function render(f: Fixture, size: number) {
  return renderToStaticMarkup(
    <Bird
      look={f.look as Look}
      pose={f.pose as Pose}
      gear={f.gear as GearId[]}
      animated={f.animated}
      size={size}
    />,
  );
}

describe("Bird matches the rig reference", () => {
  for (const f of fixtures) {
    it(f.file, () => {
      const expected = readFileSync(join(REF, f.file), "utf8");
      const width = Number(expected.match(/<svg[^>]*\swidth="(\d+)"/)![1]);
      expect(normaliseMarkup(render(f, width), ROOTLESS)).toEqual(
        normaliseMarkup(expected, ROOTLESS),
      );
    });
  }

  it("covers every fixture in the index", () => {
    expect(fixtures).toHaveLength(111);
    expect(fixtures.filter((f) => f.pose === "fly")).toHaveLength(17);
  });
});

describe("Bird with animated={false}", () => {
  const dressed = [
    ...new Set(
      fixtures.filter((f) => f.gear.length).map((f) => f.gear.join(",")),
    ),
  ];
  const gearSets: GearId[][] = [
    [],
    [...GEAR_IDS],
    ...dressed.map((g) => g.split(",") as GearId[]),
  ];

  it("has no animation anywhere, in every look, pose and dressed set", () => {
    for (const look of LOOKS)
      for (const pose of POSES)
        for (const gear of gearSets) {
          const html = renderToStaticMarkup(
            <Bird look={look} pose={pose} gear={gear} animated={false} />,
          );
          expect(html, `${look} ${pose} ${gear}`).not.toMatch(
            /animation|<animate/,
          );
        }
  });
});

describe("Bird under reduced motion", () => {
  it("relies on the global rule, which stops every inline animation", () => {
    const css = readFileSync(
      join(ROOT, "public", "assets", "motion.css"),
      "utf8",
    );
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce){*{animation:none !important}}",
    );
    const layout = readFileSync(join(ROOT, "src", "app", "layout.tsx"), "utf8");
    expect(layout).toMatch(
      /import\s+["'](?:\.\.\/)+public\/assets\/motion\.css["']/,
    );
  });

  it("moves only through inline animation styles, never SMIL", () => {
    const html = renderToStaticMarkup(
      <Bird look="gerald" gear={[...GEAR_IDS]} animated />,
    );
    expect(html).toContain("animation: coo-headbob");
    expect(html).not.toMatch(/<animate|<set\b/);
  });
});

describe("Bird props", () => {
  it("labels the bird when given a title and hides it otherwise", () => {
    expect(renderToStaticMarkup(<Bird look="brenda" title="Brenda" />)).toMatch(
      /role="img" aria-label="Brenda"/,
    );
    expect(renderToStaticMarkup(<Bird look="brenda" />)).toContain(
      'aria-hidden="true"',
    );
  });

  it("scales height from the pose's view box", () => {
    expect(renderToStaticMarkup(<Bird look="kevin" size={140} />)).toMatch(
      /width="140" height="132"/,
    );
    expect(
      renderToStaticMarkup(<Bird look="kevin" pose="fly" size={140} />),
    ).toMatch(/width="140" height="102"/);
  });

  it("mirrors the bird with flip, in any pose", () => {
    for (const pose of ["fly", "perched"] as const) {
      expect(
        renderToStaticMarkup(<Bird look="gerald" pose={pose} flip />),
      ).toMatch(/^<svg[^>]*style="[^"]*transform:scaleX\(-1\)/);
      expect(
        renderToStaticMarkup(<Bird look="gerald" pose={pose} />),
      ).not.toMatch(/^<svg[^>]*style="[^"]*transform/);
    }
  });

  it("draws the night-vision goggles as an olive helmet and one glowing tube, and leaves the aviators alone", () => {
    for (const pose of ["perched", "fly"] as const) {
      const night = renderToStaticMarkup(
        <Bird look="gerald" pose={pose} gear={["nightgoggles"]} />,
      );
      expect(night).toContain('fill="#5C6B38"');
      expect(night).toContain('fill="#5FD98A"');
      expect(night).toContain('fill="#C8F8D4"');
      expect(night).not.toContain("#D99A6C");
      expect(night).not.toContain("#86D9A0");
      expect(night).not.toContain('r="11.2"');
      expect(night).not.toContain("#DFF3FC");
      const day = renderToStaticMarkup(
        <Bird look="gerald" pose={pose} gear={["goggles"]} />,
      );
      expect(day).toContain('fill="#DFF3FC"');
      expect(day).toContain('stroke="#D99A6C"');
      expect(day).not.toContain("#5C6B38");
      expect(day).not.toContain("#5FD98A");
    }
  });

  it("flips the night-vision tube up above the crown on sleep so the closed eye shows", () => {
    for (const animated of [false, true]) {
      const html = renderToStaticMarkup(
        <Bird
          look="gerald"
          pose="sleep"
          gear={["nightgoggles"]}
          animated={animated}
        />,
      );
      expect(html).toContain('fill="#5C6B38"');
      expect(html).toContain('d="M87 31 q5 4 10 0"');
      expect(objective(html).y).toBeLessThan(16);
    }
  });

  it("keeps the night-vision tube down over the eye on every other pose", () => {
    for (const pose of POSES.filter((p) => p !== "sleep")) {
      for (const animated of [false, true]) {
        const html = renderToStaticMarkup(
          <Bird
            look="gerald"
            pose={pose}
            gear={["nightgoggles"]}
            animated={animated}
          />,
        );
        expect(
          objective(html).y,
          `${pose} animated=${animated}`,
        ).toBeGreaterThan(16);
      }
    }
  });

  it("takes the shape from breed and the colours from look", () => {
    const html = renderToStaticMarkup(
      <Bird look="gerald" breed="fantail" animated={false} />,
    );
    expect(html).toContain('d="M30 76 L-6 62');
    expect(html).toContain('fill="#B8B3D6"');
  });
});
