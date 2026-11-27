import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import { useReducedMotion } from "./LoftScene";
import { MainTop, MainTopView, useLoftTime } from "./MainTop";
import type { LoftTime } from "./loftTime";

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

type Extra = {
  perches?: number;
  hasBirdbath?: boolean;
  loftItems?: string[];
  egg?: SyncPayload["egg"];
  loft?: SyncPayload["me"]["loft"];
};

const data = (
  birds: Bird[],
  seeds = 240,
  unread = 0,
  {
    perches = 4,
    hasBirdbath = false,
    loftItems = [],
    egg = null,
    loft = null,
  }: Extra = {},
) =>
  ({
    me: {
      seeds,
      timezone: "America/New_York",
      loft,
      perches,
      hasBirdbath,
      loftItems,
    },
    birds,
    unread,
    egg,
  }) as unknown as SyncPayload;

const morning = new Date("2026-11-20T14:20:00Z").getTime();

const mock = [
  bird("Gerald"),
  bird("Brenda", { look: "brenda", status: "flying" }),
  bird("Kevin", { look: "kevin", tired: true }),
  bird("Admiral Crumbs", { look: "admiral", gear: ["cap"] }),
];

const renderAt = (nowMs: number, payload: SyncPayload) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(nowMs);
  try {
    return renderToStaticMarkup(
      <MainTop data={payload} nowMs={nowMs} offsetMs={0} />,
    ).replaceAll("&#x27;", "'");
  } finally {
    vi.useRealTimers();
  }
};

const render = (birds: Bird[], seeds?: number, unread?: number) =>
  renderAt(morning, data(birds, seeds, unread));

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

const renderWith = (birds: Bird[], extra: Extra) =>
  renderAt(morning, data(birds, 240, 0, extra));

const hrefs = (html: string) =>
  [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

const css = readFileSync(
  new URL("./MainTop.module.css", import.meta.url),
  "utf8",
);
const rule = (selector: string) =>
  css.match(new RegExp(`(?:^|\\n)${selector} \\{([^}]*)\\}`))?.[1] ?? "";

describe("the loft below the header (#972 ac-1)", () => {
  it("keeps the scene's links out of the header", () => {
    const header = render(mock).match(/<header.*?<\/header>/s)?.[0] ?? "";
    expect(hrefs(header)).toEqual(["/notifications", "/more", "/shop"]);
  });

  const home = [bird("Gerald"), bird("Kevin", { look: "kevin" })];

  it("draws the house loft with the home birds in their rooms", () => {
    const html = renderWith(home, {});
    expect(html).toContain("data-birds");
    expect(html.match(/data-room="\d+"/g)).toHaveLength(2);
    expect(html).toMatch(
      /role="img"[^>]*aria-label="Day on your rooftop loft\./,
    );
  });

  it("draws the same loft when the wall clock reads 02:00 in New York", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1795762800000);
    try {
      expect(renderWith(home, {})).toMatch(
        /role="img"[^>]*aria-label="Day on your rooftop loft\./,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds one room per owned perch, with a second floor at four", () => {
    const three = renderWith(home, { perches: 3 });
    const four = renderWith(home, { perches: 4 });
    const toLet = (html: string) =>
      html.match(/aria-label="Room to let. Open the shop"/g)?.length ?? 0;
    expect(toLet(three)).toBe(0);
    expect(toLet(four)).toBe(1);
  });

  it("shows a ready egg from sync as the egg room that opens the aviary", () => {
    const html = renderWith(home, {
      egg: { status: "ready", deliveriesToGo: 0 },
    });
    const egg = html.match(/<a[^>]*href="\/aviary"[^>]*>/)?.[0];
    expect(egg).toContain('aria-label="An egg is ready"');
    expect(hrefs(renderWith(home, {}))).not.toContain("/aviary");
  });

  it("draws the birdbath only when the profile owns one", () => {
    const label = 'aria-label="Birdbath. Open the shop"';
    expect(renderWith(home, { hasBirdbath: true })).toContain(label);
    expect(renderWith(home, { hasBirdbath: false })).not.toContain(label);
  });
});

describe("the loft add-ons in the scene (#1045 ac-2)", () => {
  const home = [bird("Gerald"), bird("Kevin", { look: "kevin" })];
  const { floorY } = config.loft.scene;
  const { cart, flowerBoxes } = config.loft.slots;

  const awning = (html: string) =>
    [...html.matchAll(/d="M([\d.]+) ([\d.]+) h11 v9 a5\.5/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));
  const planters = (html: string) =>
    [
      ...html.matchAll(
        /<rect x="([\d.]+)" y="([\d.]+)" width="56" height="13"/g,
      ),
    ].map((m) => ({ centerX: Number(m[1]) + 28, top: Number(m[2]) }));
  const swaying = (html: string) => /animation: coo-sway/.test(html);

  it("draws the espresso cart under its awning at the cart slot only when owned", () => {
    const stripes = awning(renderWith(home, { loftItems: ["espresso-cart"] }));
    expect(stripes).toHaveLength(5);
    const left = stripes[0].x;
    const right = stripes[4].x + 11;
    expect((left + right) / 2).toBeCloseTo(cart.centerX, 0);
    expect(stripes.every(({ y }) => y < floorY)).toBe(true);
    expect(awning(renderWith(home, {}))).toEqual([]);
  });

  it("draws two flower boxes hung below the deck floor, never on the deck, only when owned", () => {
    const boxes = planters(renderWith(home, { loftItems: ["flower-boxes"] }));
    expect(boxes.map((box) => box.centerX)).toEqual(flowerBoxes.centerX);
    for (const box of boxes) {
      expect(box.top).toBe(floorY + flowerBoxes.topBelowFloor);
      expect(box.top).toBeGreaterThan(floorY);
    }
    expect(planters(renderWith(home, {}))).toEqual([]);
  });

  it("draws the weathervane swaying on the roof peak only when owned", () => {
    expect(swaying(renderWith(home, { loftItems: ["weathervane"] }))).toBe(
      true,
    );
    expect(swaying(renderWith(home, {}))).toBe(false);
  });

  it("draws the birdbath and all three add-ons together", () => {
    const html = renderWith(home, {
      hasBirdbath: true,
      loftItems: ["flower-boxes", "weathervane", "espresso-cart"],
    });
    expect(html).toContain('aria-label="Birdbath. Open the shop"');
    expect(awning(html)).toHaveLength(5);
    expect(planters(html)).toHaveLength(2);
    expect(swaying(html)).toBe(true);
  });

  it("ignores a loft item id it does not know", () => {
    const html = renderWith(home, { loftItems: ["hot-tub"] });
    expect(awning(html)).toEqual([]);
    expect(planters(html)).toEqual([]);
    expect(swaying(html)).toBe(false);
  });
});

describe("the hero layout (#972 ac-2)", () => {
  it("anchors the art below the sky band to the bottom of the hero", () => {
    expect(rule("\\.top")).toMatch(/position: relative/);
    expect(rule("\\.loft")).toMatch(/position: absolute/);
    expect(rule("\\.loft")).toMatch(/bottom: 0/);
    expect(rule("\\.loft")).toMatch(/right: 0/);
    expect(rule("\\.loft")).toMatch(/left: 0/);
    expect(rule("\\.top::after")).toMatch(/aspect-ratio: 390 \/ 284/);
  });

  it("paints the top bar and greeting over the sky band", () => {
    for (const sel of ["\\.header", "\\.greeting"]) {
      expect(rule(sel)).toMatch(/position: relative/);
      expect(rule(sel)).toMatch(/z-index: 1/);
    }
    expect(render(mock)).toMatch(/^<section[^>]*style="background:#/);
  });

  it("keeps the greeting to the left two thirds", () => {
    expect(rule("\\.greeting")).toMatch(/box-sizing: border-box/);
    expect(rule("\\.greeting")).toMatch(/max-width: calc\(200% \/ 3\)/);
  });
});

const { times } = config.loft;
const LOFT = { lat: 40.73, lon: -73.9875 } as SyncPayload["me"]["loft"];
const INSTANTS: Record<LoftTime, number> = {
  sunrise: 1795089300000,
  day: 1795100400000,
  sunset: 1795123800000,
  dusk: 1795125000000,
  night: 1795131000000,
};
const LOOKS = times.order as LoftTime[];

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const tokens = readFileSync(
  new URL("../../../public/assets/tokens.css", import.meta.url),
  "utf8",
);
const token = (name: string) =>
  tokens.match(new RegExp(`${name}: (#[0-9A-Fa-f]{6});`))?.[1] ?? "";

const CONTROLS = [".bell", ".menu", ".seeds"];

const focusStyle = (control: string, source: string) =>
  new Map(
    [
      ...source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ]
      .filter(([, selectors]) =>
        selectors
          .split(",")
          .map((s) => s.trim())
          .includes(`${control}:focus-visible`),
      )
      .flatMap(([, , body]) =>
        [...body.matchAll(/([\w-]+):\s*([^;]+);/g)].map(
          ([, prop, value]) =>
            [prop, value.replace(/\s+/g, " ").trim()] as const,
        ),
      ),
  );

const focusRing = (control: string, source = css) => {
  const style = focusStyle(control, source);
  expect(
    [...style.keys()].filter((prop) =>
      /^outline-(width|style|color)$/.test(prop),
    ),
  ).toEqual([]);
  const outline = style
    .get("outline")
    ?.match(/^(\d+(?:\.\d+)?)px (\w+) var\((--coo-[\w-]+)\)$/);
  const offset = style.get("outline-offset")?.match(/^(\d+)px$/);
  const shadow = style
    .get("box-shadow")
    ?.match(/^var\(--coo-shadow-1\), 0 0 0 (\d+)px var\((--coo-[\w-]+)\)$/);
  const width = Number(outline?.[1] ?? 0);
  const spread = Number(shadow?.[1] ?? 0);
  const ink = outline ? token(outline[3]) : "";
  const halo = shadow ? token(shadow[2]) : "";
  const inkPaints = width > 0 && !["none", "hidden"].includes(outline![2]);
  return {
    ink,
    halo,
    painted: [...(inkPaints ? [ink] : []), ...(spread > 0 ? [halo] : [])],
    outsetPx: Math.max(Number(offset?.[1] ?? 0) + width, spread),
  };
};

const ringContrast = (ring: { painted: string[] }, sky: string) =>
  Math.max(0, ...ring.painted.map((color) => contrast(color, sky)));

const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const at = (s: number, a: number, b: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  return (x: number) => {
    let [lo, hi] = [0, 1];
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid, x1, x2) < x) lo = mid;
      else hi = mid;
    }
    return at((lo + hi) / 2, y1, y2);
  };
};

const mix = (under: string, over: string, alpha: number) =>
  "#" +
  [1, 3, 5]
    .map((i) => {
      const [a, b] = [under, over].map((hex) =>
        parseInt(hex.slice(i, i + 2), 16),
      );
      return Math.round(a + (b - a) * alpha)
        .toString(16)
        .padStart(2, "0");
    })
    .join("");

const layers = (html: string) =>
  [...html.matchAll(/<div[^>]* data-time="(\w+)"[^>]*>/g)].map(
    ([tag, time]) => ({ time, tag }),
  );

const heroAt = (look: LoftTime) =>
  renderAt(INSTANTS[look], data(mock, 240, 0, { loft: LOFT }));

describe("the hero takes the look's sky and text colour (#1056 ac-6)", () => {
  it.each(LOOKS)(
    "paints %s with its first sky band and text colour",
    (look) => {
      const html = heroAt(look);
      const { sky, textColor } = times[look];
      expect(html).toMatch(
        new RegExp(
          `^<section[^>]*style="background:${sky[0].color};color:${textColor}`,
        ),
      );
      expect(layers(html).map((l) => l.time)).toEqual([look]);
    },
  );

  it.each(LOOKS)(
    "keeps %s text at least 4.5 to 1 on its first sky band",
    (look) => {
      const { sky, textColor } = times[look];
      expect(contrast(textColor, sky[0].color)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("draws the header focus ring in two tones at least 9 to 1 apart", () => {
    for (const control of CONTROLS) {
      const { ink, halo } = focusRing(control);
      expect(contrast(ink, halo)).toBeGreaterThanOrEqual(9);
    }
  });

  it.each(LOOKS)(
    "rings focused header controls at least 3 to 1 on the %s sky",
    (look) => {
      for (const control of CONTROLS) {
        expect(
          ringContrast(focusRing(control), times[look].sky[0].color),
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

describe("the header focus ring through the sunset-to-dusk fade (#1081 ac-1)", () => {
  const html = renderToStaticMarkup(
    <MainTopView
      data={data(mock, 240, 0, { loft: LOFT })}
      nowMs={INSTANTS.dusk}
      look={{ time: "dusk", leaving: "sunset" }}
    />,
  );
  const [bottom, top] = layers(html).map(({ time, tag }) => ({
    time,
    color: tag.match(/background:(#[0-9A-Fa-f]{6})/)?.[1] ?? "",
    durationMs: Number(tag.match(/animation-duration:(\d+)ms/)?.[1]),
  }));

  it("paints dusk fading in over the opaque sunset sky", () => {
    expect([bottom.time, top.time]).toEqual(["sunset", "dusk"]);
    expect(bottom.color).toBe(times.sunset.sky[0].color);
    expect(top.color).toBe(times.dusk.sky[0].color);
    expect(top.durationMs).toBe(times.crossFadeMs);
    expect(rule("\\.fadeIn")).toMatch(
      /animation-timing-function: ease-in-out;/,
    );
    expect(css).toMatch(
      /@keyframes loft-fade \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 1;\s*\}/,
    );
  });

  const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
  const skyAt = (ms: number) =>
    mix(bottom.color, top.color, easeInOut(ms / top.durationMs));

  it.each(
    CONTROLS.flatMap((control) =>
      [500, 1000].map((ms) => [control, ms] as const),
    ),
  )(
    "rings %s at least 3 to 1 on the sky %i ms into the fade",
    (control, ms) => {
      expect(
        ringContrast(focusRing(control), skyAt(ms)),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each([
    [
      "a zero-width outline",
      (s: string) => s.replace("outline: 3px solid", "outline: 0px solid"),
    ],
    [
      "an outline with no style",
      (s: string) => s.replace("outline: 3px solid", "outline: 3px none"),
    ],
    [
      "a later rule that removes the outline",
      (s: string) =>
        `${s}\n.menu:focus-visible,\n.bell:focus-visible,\n.seeds:focus-visible {\n  outline: none;\n}\n`,
    ],
  ])(
    "drops below 3 to 1 at 500 and 1000 ms when %s leaves only the light halo",
    (_, unpaint) => {
      const source = unpaint(css);
      expect(source).not.toBe(css);
      for (const control of CONTROLS) {
        for (const ms of [500, 1000]) {
          expect(
            ringContrast(focusRing(control, source), skyAt(ms)),
          ).toBeLessThan(3);
        }
      }
    },
  );

  it("keeps the ring's light halo inside the header's top padding", () => {
    const padTop = Number(rule("\\.header").match(/padding: (\d+)px/)?.[1]);
    for (const control of CONTROLS) {
      expect(focusRing(control).outsetPx).toBeLessThanOrEqual(padTop);
    }
  });
});

describe("the hero rechecks the sun and cross-fades (#1056 ac-8)", () => {
  let root: Root | null = null;
  let reduce = false;
  let offsetMs = 0;
  let doc: EventTarget & { hidden: boolean };
  const motionListeners = new Set<() => void>();
  const frames: string[] = [];
  const shown = () => layers(frames.at(-1) ?? "");

  function Hero() {
    const look = useLoftTime({
      loft: LOFT,
      timeZone: "America/New_York",
      offsetMs,
      reduced: useReducedMotion(),
    });
    frames.push(
      renderToStaticMarkup(
        <MainTopView
          data={data(mock, 240, 0, { loft: LOFT })}
          nowMs={Date.now()}
          look={look}
        />,
      ),
    );
    return null;
  }

  const mount = async () => {
    root = createRoot(
      Object.assign(new EventTarget(), {
        nodeType: 1,
        tagName: "DIV",
        ownerDocument: new EventTarget(),
      }) as unknown as Element,
    );
    await act(async () => root!.render(<Hero />));
  };
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const dusk = async () => {
    vi.setSystemTime(INSTANTS.dusk);
    await advance(times.recheckMs);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(INSTANTS.sunset);
    reduce = false;
    offsetMs = 0;
    frames.length = 0;
    motionListeners.clear();
    doc = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("document", doc);
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
    );
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduce && query === "(prefers-reduced-motion: reduce)",
      addEventListener: (_: string, fn: () => void) => motionListeners.add(fn),
      removeEventListener: (_: string, fn: () => void) =>
        motionListeners.delete(fn),
    }));
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fades sunset into dusk over crossFadeMs, then keeps only dusk", async () => {
    await mount();
    expect(shown().map((l) => l.time)).toEqual(["sunset"]);
    await dusk();
    const [old, next] = shown();
    expect([old.time, next.time]).toEqual(["sunset", "dusk"]);
    expect(old.tag).toContain('aria-hidden="true"');
    expect(old.tag).toContain('inert=""');
    expect(next.tag).not.toContain("aria-hidden");
    expect(next.tag).toContain(`animation-duration:${times.crossFadeMs}ms`);
    expect(frames.at(-1)).toMatch(
      new RegExp(`^<section[^>]*style="background:${times.dusk.sky[0].color}`),
    );
    await advance(times.crossFadeMs - 1);
    expect(shown()).toHaveLength(2);
    await advance(1);
    expect(shown().map((l) => l.time)).toEqual(["dusk"]);
    expect(shown()[0].tag).not.toContain("animation-duration");
  });

  it("mounts on the server-corrected look with no fade from cached time", async () => {
    vi.setSystemTime(1795123530000);
    offsetMs = 600000;
    await mount();
    for (const step of [0, times.crossFadeMs / 2, times.crossFadeMs / 2 - 1]) {
      await advance(step);
      expect(shown().map((l) => l.time)).toEqual(["dusk"]);
      expect(shown()[0].tag).not.toContain("animation");
    }
    expect(frames.map((f) => layers(f).map((l) => l.time))).not.toContainEqual(
      expect.arrayContaining(["sunset"]),
    );
  });

  it("swaps at once with reduced motion", async () => {
    reduce = true;
    await mount();
    await dusk();
    expect(shown().map((l) => l.time)).toEqual(["dusk"]);
    expect(shown()[0].tag).not.toContain("animation");
  });

  it("never brings sunset back when reduced motion toggles mid-fade", async () => {
    const setReduced = (on: boolean) =>
      act(async () => {
        reduce = on;
        motionListeners.forEach((fn) => fn());
      });
    await mount();
    await dusk();
    expect(shown().map((l) => l.time)).toEqual(["sunset", "dusk"]);
    const fadeStart = frames.length;
    await setReduced(true);
    expect(shown().map((l) => l.time)).toEqual(["dusk"]);
    expect(shown()[0].tag).not.toContain("animation");
    await advance(times.crossFadeMs / 2);
    await setReduced(false);
    await advance(times.crossFadeMs);
    expect(shown().map((l) => l.time)).toEqual(["dusk"]);
    const later = frames.slice(fadeStart + 1).map(layers);
    expect(later.flat().map((l) => l.time)).not.toContain("sunset");
    expect(later.flat().map((l) => l.tag)).not.toContainEqual(
      expect.stringContaining("animation"),
    );
  });

  it("runs no timer while the tab is hidden and rechecks when it shows", async () => {
    await mount();
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => {
      doc.hidden = true;
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(INSTANTS.dusk);
    await act(async () => {
      doc.hidden = false;
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    expect(shown().at(-1)?.time).toBe("dusk");
  });

  it("drops a fade in flight when the tab hides", async () => {
    await mount();
    await dusk();
    expect(shown()).toHaveLength(2);
    await act(async () => {
      doc.hidden = true;
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(shown().map((l) => l.time)).toEqual(["dusk"]);
  });

  it("animates only opacity in the loft-fade keyframes", () => {
    const keyframes =
      css.match(/@keyframes loft-fade \{([\s\S]*?\})\s*\}/)?.[1] ?? "";
    const props = [...keyframes.matchAll(/([\w-]+):/g)].map((m) => m[1]);
    expect(props.length).toBeGreaterThan(0);
    expect(new Set(props)).toEqual(new Set(["opacity"]));
  });
});
