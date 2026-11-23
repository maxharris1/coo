import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncPayload } from "@/components/sync";
import { LoftScene } from "./LoftScene";

type Bird = SyncPayload["birds"][number];

const bird = (name: string, over: Partial<Bird> = {}): Bird =>
  ({
    id: name.toLowerCase(),
    name,
    look: "gerald",
    breed: "city",
    pronoun: "he",
    status: "home",
    tired: false,
    gear: [],
    ...over,
  }) as Bird;

const render = (birds: Bird[], perches: number) =>
  renderToStaticMarkup(<LoftScene birds={birds} perches={perches} />)
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"');

const scene = (html: string) =>
  html.match(/<svg[^>]*role="img".*?<\/svg>(?=<a|<\/div>$)/s)?.[0] ?? "";
const label = (html: string) =>
  html.match(/<svg[^>]*role="img"[^>]*aria-label="([^"]*)"/)?.[1] ?? "";
const viewBox = (html: string) =>
  html.match(/<svg[^>]*role="img"[^>]*viewBox="([^"]*)"/)?.[1] ??
  html.match(/<svg[^>]*viewBox="([^"]*)"[^>]*role="img"/)?.[1];
const count = (html: string, attr: string) =>
  html.match(new RegExp(`${attr}=""`, "g"))?.length ?? 0;
const sceneLinks = (html: string) =>
  [...html.matchAll(/<a[^>]*data-scene-bird=""[^>]*>/g)].map((m) => m[0]);
const linkTo = (html: string, b: Bird) =>
  sceneLinks(html).filter(
    (a) =>
      a.includes(`href="/birds/${b.id}"`) &&
      a.includes(`aria-label="Open ${b.name}"`),
  );
const perchedSlots = (html: string) =>
  [
    ...html.matchAll(
      /data-ledge-bird="" data-slot="(\d)" transform="([^"]*)"/g,
    ),
  ].map(([, slot, transform]) => ({ slot: Number(slot), transform }));
const ledgeBirds = (html: string) =>
  [...html.matchAll(/<g data-ledge-bird=""[^>]*>(.*?)<\/svg><\/g><\/g>/gs)].map(
    (m) => m[1],
  );

const gerald = bird("Gerald");
const brenda = bird("Brenda", { look: "brenda" });
const tumbler = bird("Benjamin", {
  look: "tumbler",
  breed: "tumbler",
  gear: ["goggles", "tube", "bandana"],
});
const five = [
  gerald,
  brenda,
  tumbler,
  bird("Pip", { look: "kevin" }),
  bird("Dot", { look: "admiral", gear: ["cap"] }),
];

const reduceMotion = (matches: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches && query === "(prefers-reduced-motion: reduce)",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

afterEach(() => vi.unstubAllGlobals());

describe("the hatched bird regression (#884, ac-2)", () => {
  it("draws Gerald, Brenda and an equipped tumbler at 5 perches, named and linked", () => {
    const html = render([gerald, brenda, tumbler], 5);
    expect(count(html, "data-ledge-bird")).toBe(3);
    for (const b of [gerald, brenda, tumbler]) {
      expect(label(html)).toContain(b.name);
      expect(linkTo(html, b)).toHaveLength(1);
    }
    expect(label(html)).toBe(
      "Your rooftop loft. Gerald, Brenda and Benjamin sit on their perches. Two perches are free.",
    );
    const drawnTumbler = ledgeBirds(html)[2];
    expect(drawnTumbler).toBeDefined();
    expect(drawnTumbler).not.toBe(
      ledgeBirds(render([gerald, brenda, { ...tumbler, gear: [] }], 5))[2],
    );
  });

  it("draws five awake birds at 5 perches with five links", () => {
    const html = render(five, 5);
    expect(count(html, "data-ledge-bird")).toBe(5);
    expect(sceneLinks(html)).toHaveLength(5);
    for (const b of five) expect(linkTo(html, b)).toHaveLength(1);
  });

  it("keeps each bird on its hatch-order slot whether 1 or 5 are home", () => {
    const full = perchedSlots(render(five, 5));
    for (let n = 1; n <= 5; n++) {
      expect(perchedSlots(render(five.slice(0, n), 5))).toEqual(
        full.slice(0, n),
      );
    }
    const away = perchedSlots(
      render([{ ...gerald, status: "flying" }, ...five.slice(1)], 5),
    );
    expect(away).toEqual(full.slice(1));
  });
});

describe("perches drawn (ac-3)", () => {
  for (const [perches, height, rack] of [
    [3, 236, 0],
    [4, 262, 1],
    [5, 262, 1],
  ] as const) {
    it(`draws ${perches} planks, ${rack} rack and a ${height} tall scene`, () => {
      const html = render([], perches);
      expect(count(html, "data-perch")).toBe(perches);
      expect(count(html, "data-perch-rack")).toBe(rack);
      expect(viewBox(html)).toBe(`0 0 390 ${height}`);
    });
  }

  it("shows five bare planks in a bird-free 5-perch loft", () => {
    const html = render([], 5);
    expect(count(html, "data-perch")).toBe(5);
    expect(count(html, "data-ledge-bird")).toBe(0);
    expect(sceneLinks(html)).toHaveLength(0);
    expect(label(html)).toBe("Your rooftop loft. Five perches are free.");
  });
});

describe("home and away (ac-4)", () => {
  it("perches the awake birds, sleeps the tired one, tags the flyer and leaves their perches bare", () => {
    const kevin = bird("Kevin", { look: "kevin", tired: true });
    const flyer = { ...brenda, status: "flying" } as Bird;
    const html = render([gerald, tumbler, kevin, flyer], 5);
    expect(perchedSlots(html).map((p) => p.slot)).toEqual([0, 1]);
    expect(count(html, "data-sleeper")).toBe(1);
    expect(html.match(/>OUT<\/text>/g)).toHaveLength(1);
    expect(count(html, "data-perch")).toBe(5);
    expect(sceneLinks(html)).toHaveLength(4);
    for (const b of [gerald, tumbler, kevin, flyer]) {
      expect(linkTo(html, b)).toHaveLength(1);
    }
    expect(label(html)).toBe(
      "Your rooftop loft. Gerald and Benjamin sit on their perches, Kevin is asleep in the coop, and Brenda's door has an OUT tag on it. Three perches are free.",
    );
  });

  it("keeps napping and bathing birds on their perch with no OUT tag", () => {
    const nap = bird("Gerald", { status: "busy", busyKind: "nap" });
    const bath = bird("Brenda", { status: "busy", busyKind: "bath" });
    const html = render([nap, bath], 3);
    expect(html).not.toContain(">OUT</text>");
    expect(perchedSlots(html).map((p) => p.slot)).toEqual([0, 1]);
  });

  it("tags a flying or visiting bird and draws it on no perch", () => {
    for (const status of ["flying", "visiting"] as const) {
      const html = render([bird("Brenda", { status })], 3);
      expect(html).toContain(">OUT</text>");
      expect(count(html, "data-ledge-bird")).toBe(0);
    }
  });
});

describe("scene links (#822, ac-5)", () => {
  const css = readFileSync(
    new URL("./MainTop.module.css", import.meta.url),
    "utf8",
  );

  it("keeps links out of the scene picture", () => {
    expect(scene(render(five, 5))).not.toContain("<a");
  });

  it("gives each scene target 44 px, a focus ring and a pressed state", () => {
    expect(css).toMatch(/\.birdLink \{[^}]*min-width: var\(--coo-touch\)/);
    expect(css).toMatch(/\.birdLink \{[^}]*min-height: var\(--coo-touch\)/);
    expect(css).toMatch(/\.birdLink:focus-visible \{[^}]*outline: 3px solid/);
    expect(css).toMatch(/\.birdLink:active \{/);
  });
});

describe("scene motion (ac-6, ac-7)", () => {
  const clouds = (html: string) =>
    [...html.matchAll(/<image data-cloud=""[^>]*>/g)].map((m) => m[0]);

  it("drifts every cloud across the sky and wraps it, each at its own few px/s", () => {
    reduceMotion(false);
    const all = clouds(render(five, 5));
    expect(all.length).toBeGreaterThanOrEqual(2);
    const speeds = all.map((c) => {
      const travel = Number(c.match(/--coo-cloud-travel:([\d.]+)px/)?.[1]);
      const seconds = Number(
        c.match(
          /animation:coo-cloud-wrap ([\d.]+)s linear -[\d.]+s infinite/,
        )?.[1],
      );
      expect(Number(c.match(/ x="(-?[\d.]+)"/)?.[1])).toBeLessThan(0);
      return travel / seconds;
    });
    for (const s of speeds) {
      expect(s).toBeGreaterThanOrEqual(4);
      expect(s).toBeLessThanOrEqual(8);
    }
    expect(new Set(speeds.map((s) => s.toFixed(1))).size).toBe(speeds.length);
  });

  it("animates perched birds when motion is allowed", () => {
    reduceMotion(false);
    for (const b of ledgeBirds(render(five, 5))) {
      expect(b).toContain("animation:");
    }
  });

  it("turns scene motion off under prefers-reduced-motion", () => {
    reduceMotion(true);
    const html = render([gerald, brenda, tumbler], 5);
    const birds = ledgeBirds(html);
    expect(birds).toHaveLength(3);
    for (const b of birds) expect(b).not.toContain("animation");
    for (const c of clouds(html)) expect(c).not.toContain("style=");
    expect(html).not.toMatch(/data-idle="/);
  });

  it("pauses every scene animation while the tab is hidden, and keeps the reduced-motion rules", () => {
    const css = readFileSync(
      new URL("./MainTop.module.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(
      /\.loft\[data-paused\] \* \{\s*animation-play-state: paused !important;/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.loft \*,\s*\.snooze \{\s*animation: none;/,
    );
  });
});
