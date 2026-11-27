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

const render = (birds: Bird[], seeds?: number, unread?: number) =>
  renderToStaticMarkup(
    <MainTop data={data(birds, seeds, unread)} nowMs={morning} offsetMs={0} />,
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
  renderToStaticMarkup(
    <MainTop data={data(birds, 240, 0, extra)} nowMs={morning} offsetMs={0} />,
  ).replaceAll("&#x27;", "'");

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

const layers = (html: string) =>
  [...html.matchAll(/<div[^>]* data-time="(\w+)"[^>]*>/g)].map(
    ([tag, time]) => ({ time, tag }),
  );

describe("the hero takes the look's sky and text colour (#1056 ac-6)", () => {
  it.each(LOOKS)(
    "paints %s with its first sky band and text colour",
    (look) => {
      const html = renderToStaticMarkup(
        <MainTop
          data={data(mock, 240, 0, { loft: LOFT })}
          nowMs={INSTANTS[look]}
          offsetMs={0}
        />,
      );
      const { sky, textColor } = times[look];
      expect(html).toMatch(
        new RegExp(
          `^<section[^>]*style="background:${sky[0].color};color:${textColor}"`,
        ),
      );
      expect(layers(html).map((l) => l.time)).toEqual([look]);
    },
  );

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

  it.each(LOOKS)(
    "keeps %s text at least 4.5 to 1 on its first sky band",
    (look) => {
      const { sky, textColor } = times[look];
      expect(contrast(textColor, sky[0].color)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("the hero rechecks the sun and cross-fades (#1056 ac-8)", () => {
  let root: Root | null = null;
  let reduce = false;
  let doc: EventTarget & { hidden: boolean };
  const frames: string[] = [];
  const shown = () => layers(frames.at(-1) ?? "");

  function Hero() {
    const look = useLoftTime({
      nowMs: Date.now(),
      loft: LOFT,
      timeZone: "America/New_York",
      offsetMs: 0,
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
    frames.length = 0;
    doc = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("document", doc);
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
    );
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduce && query === "(prefers-reduced-motion: reduce)",
      addEventListener: () => {},
      removeEventListener: () => {},
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

  it("swaps at once with reduced motion", async () => {
    reduce = true;
    await mount();
    await dusk();
    expect(shown().map((l) => l.time)).toEqual(["dusk"]);
    expect(shown()[0].tag).not.toContain("animation");
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
