import { readFileSync } from "node:fs";
import {
  act,
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import { EspressoSheet } from "./EspressoSheet";
import { LoftScene } from "./LoftScene";
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

type Extra = {
  perches?: number;
  hasBirdbath?: boolean;
  loftItems?: string[];
  egg?: SyncPayload["egg"];
  espressoShots?: number;
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
    espressoShots = 0,
  }: Extra = {},
) =>
  ({
    me: {
      seeds,
      timezone: "America/New_York",
      loft: null,
      perches,
      hasBirdbath,
      loftItems,
      espressoShots,
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
    <MainTop data={data(birds, 240, 0, extra)} nowMs={morning} />,
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
    expect(html).toMatch(/role="img"[^>]*aria-label="Your rooftop loft\./);
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
    expect(rule("\\.top")).toMatch(/background: var\(--coo-sky\)/);
  });

  it("keeps the greeting to the left two thirds", () => {
    expect(rule("\\.greeting")).toMatch(/box-sizing: border-box/);
    expect(rule("\\.greeting")).toMatch(/max-width: calc\(200% \/ 3\)/);
  });
});

describe("the espresso cart opens the espresso sheet (#1046 ac-2)", () => {
  const home = [bird("Gerald")];
  const CART = 'aria-label="Espresso cart. See espresso shots"';
  let root: Root | null = null;

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = null;
    vi.unstubAllGlobals();
  });

  type Props = { onCart?: () => void; onClose?: () => void; held?: number };
  const find = (node: ReactNode, type: unknown) => {
    const walk = (n: ReactNode): ReactElement<Props> | undefined => {
      if (!isValidElement<Props & { children?: ReactNode }>(n)) return;
      if (n.type === type) return n;
      for (const child of Children.toArray(n.props.children)) {
        const hit = walk(child);
        if (hit) return hit;
      }
    };
    return walk(node);
  };

  const mount = async (extra: Extra) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("document", new EventTarget());
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
    );
    let out: ReactNode = null;
    function Probe() {
      out = MainTop({ data: data(home, 240, 0, extra), nowMs: morning });
      return null;
    }
    root = createRoot(
      Object.assign(new EventTarget(), {
        nodeType: 1,
        tagName: "DIV",
        ownerDocument: new EventTarget(),
      }) as unknown as Element,
    );
    await act(async () => root!.render(<Probe />));
    return () => out;
  };

  it("opens a dialog with the shots held when the owned cart is tapped, and Close removes it", async () => {
    const top = await mount({ loftItems: ["espresso-cart"], espressoShots: 2 });
    expect(find(top(), EspressoSheet)).toBeUndefined();

    const onCart = find(top(), LoftScene)?.props.onCart;
    await act(async () => onCart?.());
    const sheet = find(top(), EspressoSheet);
    expect(sheet?.props.held).toBe(2);
    const html = renderToStaticMarkup(top());
    expect(html).toMatch(/role="dialog"/);
    expect(html).toContain(">You hold 2 shots<");

    await act(async () => sheet?.props.onClose?.());
    expect(find(top(), EspressoSheet)).toBeUndefined();
    expect(renderToStaticMarkup(top())).not.toMatch(/role="dialog"/);
  });

  it("draws the cart button only when the cart is owned", () => {
    expect(renderWith(home, { loftItems: ["espresso-cart"] })).toContain(CART);
    expect(renderWith(home, {})).not.toContain(CART);
  });
});
