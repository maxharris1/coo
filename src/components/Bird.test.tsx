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

const ROOT_ONLY = (name: string) =>
  name === "role" || name === "style" || name.startsWith("aria-");

function normalise(svg: string): string[] {
  const body = svg.replace(/<style>[\s\S]*?<\/style>/g, "");
  const out: string[] = [];
  let first = true;
  for (const [, text, close, name, attrs, selfClose] of body.matchAll(
    /([^<]*)(?:<(\/?)([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>)?/g,
  )) {
    const t = text.replace(/\s+/g, " ").trim();
    if (t) out.push(`#text ${t}`);
    if (!name) continue;
    if (close) {
      out.push(`</${name}>`);
      continue;
    }
    const pairs = [...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)]
      .filter(([, k]) => !(first && ROOT_ONLY(k)))
      .map(([, k, v]) => {
        const value =
          k === "style"
            ? v
                .split(";")
                .map((d) => d.replace(/\s+/g, " ").trim())
                .filter(Boolean)
                .join("; ")
            : v.replace(/\s+/g, " ").trim();
        return `${k}="${value}"`;
      })
      .sort();
    first = false;
    out.push(`<${name} ${pairs.join(" ")}>`);
    if (selfClose) out.push(`</${name}>`);
  }
  return out;
}

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
    if (f.pose === "fly") {
      it.todo(`${f.file} (flying pose, part 11b #75)`);
      continue;
    }
    it(f.file, () => {
      const expected = readFileSync(join(REF, f.file), "utf8");
      const width = Number(expected.match(/<svg[^>]*\swidth="(\d+)"/)![1]);
      expect(normalise(render(f, width))).toEqual(normalise(expected));
    });
  }

  it("covers every non-fly fixture in the index", () => {
    expect(fixtures.filter((f) => f.pose !== "fly")).toHaveLength(94);
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
  });

  it("takes the shape from breed and the colours from look", () => {
    const html = renderToStaticMarkup(
      <Bird look="gerald" breed="fantail" animated={false} />,
    );
    expect(html).toContain('d="M30 76 L-6 62');
    expect(html).toContain('fill="#B8B3D6"');
  });
});
