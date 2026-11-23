import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SyncPayload } from "@/components/sync";
import { MainTop } from "./MainTop";

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

const data = (birds: Bird[], seeds = 240, unread = 0) =>
  ({
    me: { seeds, timezone: "America/New_York", loft: null },
    birds,
    unread,
  }) as unknown as SyncPayload;

const morning = new Date("2026-11-20T14:20:00Z").getTime();

const mock = [
  bird("Gerald"),
  bird("Brenda", { look: "brenda", status: "flying" }),
  bird("Kevin", { look: "kevin", tired: true }),
  bird("Admiral Crumbs", { look: "admiral", gear: ["cap"] }),
];

const render = (birds: Bird[], seeds?: number, unread?: number) =>
  renderToStaticMarkup(
    <MainTop data={data(birds, seeds, unread)} nowMs={morning} />,
  ).replaceAll("&#x27;", "'");

describe("the top of Main (ac-1)", () => {
  const html = render(mock);

  it("shows the coo wordmark", () => {
    expect(html).toMatch(/<p[^>]*>coo<\/p>/);
  });

  const link = (markup: string, href: string) =>
    markup.match(new RegExp(`<a[^>]*href="${href}"[^>]*>.*?</a>`, "s"))?.[0];

  it("links the menu button to More with a label", () => {
    expect(link(html, "/more")).toContain(
      'aria-label="Open the post office menu"',
    );
  });

  it("shows the seed balance in a labelled pill that opens the seed store", () => {
    const pill = link(html, "/shop");
    expect(pill).toContain(
      'aria-label="Seed balance, 240 seeds. Open the seed store"',
    );
    expect(pill).toContain("<span>240</span>");
    expect(link(render(mock, 1), "/shop")).toContain(
      'aria-label="Seed balance, 1 seed. Open the seed store"',
    );
  });

  it("shows the unread count from sync on a bell that opens Notifications (ac-3)", () => {
    const bell = link(render(mock, 240, 3), "/notifications");
    expect(bell).toContain('aria-label="Notifications, 3 unread"');
    expect(bell).toMatch(/<span[^>]*>3<\/span>/);
    expect(link(render(mock, 240, 1), "/notifications")).toContain(
      'aria-label="Notifications, 1 unread"',
    );
  });

  it("shows no badge on the bell at 0 unread (ac-3)", () => {
    const bell = link(html, "/notifications");
    expect(bell).toContain('aria-label="Notifications"');
    expect(bell).not.toContain("<span");
  });

  it("greets by time of day with birds home and flying counted in words", () => {
    expect(html).toMatch(
      /<h1[^>]*>Morning. Three birds home, one flying.<\/h1>/,
    );
  });

  it("greets a bird on an odd job as out on a job", () => {
    const onJob = bird("Brenda", { status: "busy", busyKind: "job" });
    expect(render([bird("Gerald"), onJob])).toMatch(
      /<h1[^>]*>Morning. One bird home, one out on a job.<\/h1>/,
    );
  });

  it("draws the loft scene from the assets/svg illustrations", () => {
    for (const asset of ["coop", "water-tower", "cloud"]) {
      expect(html).toContain(`href="/assets/svg/illustrations/${asset}.svg"`);
    }
  });

  it("describes the scene from the flock", () => {
    expect(html).toContain(
      'aria-label="Your rooftop loft. Gerald and Admiral Crumbs stand on the ledge, Kevin is asleep in the coop, and Brenda\'s door has an OUT tag on it."',
    );
  });

  it("hangs the OUT tag only when a bird is away and the sleeper only when one is tired", () => {
    const calm = render([bird("Gerald")]);
    expect(html).toContain(">OUT</text>");
    expect(calm).not.toContain(">OUT</text>");
    expect(html).toContain("data-sleeper");
    expect(calm).not.toContain("data-sleeper");
    expect(calm).toContain(
      'aria-label="Your rooftop loft. Gerald stands on the ledge."',
    );
  });

  it("keeps napping and bathing birds home, with no OUT tag", () => {
    const nap = bird("Gerald", { status: "busy", busyKind: "nap" });
    const bath = bird("Brenda", { status: "busy", busyKind: "bath" });
    const both = render([nap, bath]);
    expect(both).toMatch(/<h1[^>]*>Morning. Two birds home.<\/h1>/);
    expect(both).not.toContain(">OUT</text>");
    expect(both.match(/data-ledge-bird/g)).toHaveLength(2);

    for (const busy of [nap, bath]) {
      const alone = render([busy]);
      expect(alone).not.toContain(">OUT</text>");
      expect(alone.match(/data-ledge-bird/g)).toHaveLength(1);
      const tired = render([{ ...busy, tired: true }]);
      expect(tired).not.toContain(">OUT</text>");
      expect(tired).toContain("data-sleeper");
    }
  });

  it("still hangs the OUT tag for a flying or visiting bird", () => {
    for (const status of ["flying", "visiting"] as const) {
      const html = render([bird("Brenda", { status })]);
      expect(html).toContain(">OUT</text>");
      expect(html).not.toContain("data-ledge-bird");
    }
  });

  it("uses only tokens for colour in its stylesheet", () => {
    const css = readFileSync(
      new URL("./MainTop.module.css", import.meta.url),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("keeps the header tap targets at least 44 px", () => {
    const css = readFileSync(
      new URL("./MainTop.module.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(/\.menu \{[^}]*width: var\(--coo-touch\)/);
    expect(css).toMatch(/\.seeds \{[^}]*min-height: var\(--coo-touch\)/);
    expect(css).toMatch(/\.bell \{[^}]*width: var\(--coo-touch\)/);
  });
});

describe("tapping a bird in the loft scene (ac-4)", () => {
  const sceneLinks = (markup: string) =>
    [...markup.matchAll(/<a[^>]*data-scene-bird=""[^>]*>/g)].map((m) => m[0]);

  const html = render([
    bird("Gerald"),
    bird("Kevin", { look: "kevin", tired: true }),
    bird("Brenda", { look: "brenda", status: "flying" }),
  ]);

  it("opens each drawn bird's page: ledge, sleeper and OUT tag", () => {
    const links = sceneLinks(html);
    expect(links).toHaveLength(3);
    for (const [id, name] of [
      ["gerald", "Gerald"],
      ["kevin", "Kevin"],
      ["brenda", "Brenda"],
    ]) {
      expect(
        links.filter(
          (a) =>
            a.includes(`href="/birds/${id}"`) &&
            a.includes(`aria-label="Open ${name}"`),
        ),
      ).toHaveLength(1);
    }
  });

  it("keeps the links out of the scene picture and the header unchanged", () => {
    expect(html.match(/<svg[^>]*role="img".*?<\/svg>/s)?.[0]).not.toContain(
      "<a",
    );
    const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.filter((h) => !h.startsWith("/birds/"))).toEqual([
      "/notifications",
      "/more",
      "/shop",
    ]);
  });

  it("targets only the birds drawn: no tired or away bird on the ledge", () => {
    const loft = render([
      bird("Gerald"),
      bird("Benjamin", { look: "tumbler", breed: "tumbler" }),
      bird("Kevin", { look: "kevin", tired: true }),
      bird("Brenda", { look: "brenda", status: "flying" }),
    ]);
    expect(loft.match(/data-ledge-bird/g)).toHaveLength(2);
    expect(loft.match(/data-sleeper/g)).toHaveLength(1);
    expect(loft.match(/>OUT<\/text>/g)).toHaveLength(1);
    const hrefs = sceneLinks(loft).map((a) => a.match(/href="([^"]+)"/)?.[1]);
    expect(hrefs.sort()).toEqual(
      [
        "/birds/benjamin",
        "/birds/brenda",
        "/birds/gerald",
        "/birds/kevin",
      ].sort(),
    );
    expect(sceneLinks(render([bird("Gerald")]))).toHaveLength(1);
  });
  it("gives each scene target 44 px, a focus ring and a pressed state", () => {
    const css = readFileSync(
      new URL("./MainTop.module.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(/\.birdLink \{[^}]*min-width: var\(--coo-touch\)/);
    expect(css).toMatch(/\.birdLink \{[^}]*min-height: var\(--coo-touch\)/);
    expect(css).toMatch(/\.birdLink:focus-visible \{[^}]*outline: 3px solid/);
    expect(css).toMatch(/\.birdLink:active \{/);
  });
});

describe("every home bird on the ledge, up to five (#884)", () => {
  const W = 390;
  const H = 230;
  const SIZE = 120;
  const PERCHED = 113;
  const SLEEPER_CENTRE = { x: 71, y: 176 };
  const OUT_CENTRE = { x: 132, y: 147 };

  type Box = { x: number; y: number; w: number; h: number };

  const ledgeBoxes = (markup: string): Box[] =>
    [
      ...markup.matchAll(
        /data-ledge-bird="" transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)"/g,
      ),
    ].map(([, x, y, s]) => ({
      x: Number(x),
      y: Number(y),
      w: SIZE * Number(s),
      h: PERCHED * Number(s),
    }));

  const covers = (b: Box, p: { x: number; y: number }) =>
    p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  const sceneLinks = (markup: string) =>
    [...markup.matchAll(/<a[^>]*data-scene-bird=""[^>]*>/g)].map((m) => m[0]);

  const label = (markup: string) =>
    markup.match(/<svg[^>]*role="img"[^>]*aria-label="([^"]*)"/)?.[1] ?? "";

  const starters = [
    bird("Gerald"),
    bird("Brenda", { look: "brenda" }),
    bird("Benjamin", { look: "tumbler", breed: "tumbler" }),
    bird("Pip", { look: "kevin" }),
    bird("Dot", { look: "admiral" }),
  ];

  const expectAllDrawnAndLinked = (birds: Bird[]) => {
    const html = render(birds);
    expect(html.match(/data-ledge-bird/g)).toHaveLength(birds.length);
    for (const b of birds) {
      expect(label(html)).toContain(b.name);
      expect(
        sceneLinks(html).filter(
          (a) =>
            a.includes(`href="/birds/${b.id}"`) &&
            a.includes(`aria-label="Open ${b.name}"`),
        ),
      ).toHaveLength(1);
    }
    expect(sceneLinks(html)).toHaveLength(birds.length);
  };

  it("draws a hatched tumbler as the third bird on the ledge, named and linked", () => {
    const three = [
      bird("Gerald"),
      bird("Brenda", { look: "brenda" }),
      starters[2],
    ];
    expectAllDrawnAndLinked(three);
    expect(label(render(three))).toBe(
      "Your rooftop loft. Gerald, Brenda and Benjamin stand on the ledge.",
    );
  });

  it("draws all five home birds, the perch maximum, named and linked", () => {
    expectAllDrawnAndLinked(starters);
  });

  it("fits every ledge layout in the scene, each bird on top at its own centre", () => {
    for (let n = 1; n <= 5; n++) {
      const boxes = ledgeBoxes(render(starters.slice(0, n)));
      expect(boxes).toHaveLength(n);
      boxes.forEach((b, i) => {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(W);
        expect(b.y + b.h).toBeLessThanOrEqual(H);
        expect(b.y + b.h).toBeGreaterThanOrEqual(190);
        for (const later of boxes.slice(i + 1)) {
          expect(covers(later, centre(b))).toBe(false);
        }
      });
    }
  });

  it("keeps a two-bird loft at today's spots", () => {
    const html = render(starters.slice(0, 2));
    expect(html).toContain('transform="translate(192 112) scale(0.82)"');
    expect(html).toContain('transform="translate(288 116) scale(0.78)"');
  });

  it("leaves the sleeper and the OUT tag tappable beside a full ledge", () => {
    const tired = bird("Kevin", { look: "kevin", tired: true });
    const flying = bird("Sid", { look: "brenda", status: "flying" });
    for (const birds of [
      [...starters.slice(0, 2), tired, flying],
      [...starters.slice(0, 3), tired, flying],
      [...starters.slice(0, 4), tired],
      [...starters.slice(0, 4), flying],
    ]) {
      const html = render(birds);
      for (const b of ledgeBoxes(html)) {
        expect(covers(b, SLEEPER_CENTRE)).toBe(false);
        expect(covers(b, OUT_CENTRE)).toBe(false);
      }
    }
  });
});
