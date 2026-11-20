import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import motion from "../../public/assets/motion.json";
import { normaliseMarkup } from "./normaliseMarkup";
import { Landing, Takeoff } from "./Takeoff";

const REFERENCE = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "public",
    "assets",
    "rig-reference",
    "takeoff.html",
  ),
  "utf8",
);

function stage(heading: string) {
  const block = REFERENCE.split(`<h3>${heading}`)[1].split("<h3>")[0];
  return block
    .slice(block.indexOf("<div", block.indexOf("<div") + 1))
    .replace(/<\/div>\s*$/, "");
}

const duration = (name: string) =>
  motion.keyframes.find((k) => k.name === name)!.duration;

const inline = (html: string) =>
  html.replaceAll(' xmlns="http://www.w3.org/2000/svg"', "");

const animations = (html: string) =>
  [...html.matchAll(/<div style="[^"]*animation:([^";]+)/g)].map((m) =>
    m[1].trim(),
  );

describe("Takeoff matches the rig reference", () => {
  it("renders the reference sprites, played once and held", () => {
    const expected = stage("Takeoff")
      .replace(
        'style="position:absolute;left:60px;bottom:0; width: 160px"',
        'style="position: relative; width: 160px"',
      )
      .replace(
        "transform-origin: 46% 100%; animation",
        "transform-origin: 46% 100%; opacity: 0; animation",
      )
      .replaceAll("3s linear infinite", "2.5s linear 0.94 forwards");
    const html = renderToStaticMarkup(
      <Takeoff look="gerald" gear={["goggles", "band"]} size={160} />,
    );
    expect(normaliseMarkup(inline(html))).toEqual(normaliseMarkup(expected));
  });

  it("plays each sprite once over 2.5s and holds the end frame", () => {
    const html = renderToStaticMarkup(<Takeoff look="gerald" />);
    expect(animations(html)).toEqual([
      "coo-takeoff-crouch 2.5s linear 0.94 forwards",
      "coo-takeoff-fly 2.5s linear 0.94 forwards",
    ]);
  });
});

describe("Landing matches the rig reference", () => {
  it("renders the reference sprites, played once and held", () => {
    const expected = stage("Landing")
      .replace(
        'style="position:absolute;left:60px;bottom:0; width: 150px"',
        'style="position: relative; width: 150px"',
      )
      .replace(
        "transform-origin: 46% 100%; opacity: 0; animation",
        "transform-origin: 46% 100%; animation",
      )
      .replaceAll("4s linear infinite", "4s linear 0.94 forwards");
    const html = renderToStaticMarkup(
      <Landing look="gerald" gear={["goggles", "band"]} size={150} />,
    );
    expect(normaliseMarkup(inline(html))).toEqual(normaliseMarkup(expected));
  });

  it("plays each sprite once for the motion.json duration and holds", () => {
    const html = renderToStaticMarkup(<Landing look="gerald" />);
    expect(animations(html)).toEqual([
      `coo-land-perch ${duration("coo-land-perch")} linear 0.94 forwards`,
      `coo-land-fly ${duration("coo-land-fly")} linear 0.94 forwards`,
    ]);
    expect(duration("coo-land-perch")).toBe("4s");
  });
});

describe("Takeoff and Landing props", () => {
  it("default to the reference widths", () => {
    expect(renderToStaticMarkup(<Takeoff look="kevin" />)).toMatch(
      /^<div style="position:relative;width:160px">/,
    );
    expect(renderToStaticMarkup(<Landing look="kevin" />)).toMatch(
      /^<div style="position:relative;width:150px">/,
    );
  });

  it("label only the perched sprite with the title", () => {
    for (const Flight of [Takeoff, Landing]) {
      const html = renderToStaticMarkup(
        <Flight look="brenda" title="Brenda" />,
      );
      expect(html.match(/aria-label="Brenda"/g)).toHaveLength(1);
      expect(html.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(1);
      expect(html).toMatch(
        /transform-origin:46% 100%[^"]*"><svg[^>]*role="img" aria-label="Brenda"/,
      );
    }
  });
});
