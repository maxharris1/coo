import { readFileSync } from "node:fs";
import { act, Children, isValidElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Bird as BirdArt,
  PERCH_VB,
  type GearId,
  type Look,
} from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import birdLooks from "../../../public/assets/data/birds.json";
import { describeLoft, loftRooms } from "./flockRows";
import { awakeIds, LoftScene, LoftSceneView, useLoftMotion } from "./LoftScene";
import type { LoftItem } from "./loftArt";
import { gestureAnimation, GESTURES, REST_MS, type Gesture } from "./loftIdle";
import { birdBox, loftLayout } from "./loftLayout";

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

type Props = {
  birds: Bird[];
  perches: number;
  egg?: { status: string } | null;
  items?: LoftItem[];
  onCart?: () => void;
};

const render = ({ birds, perches, egg = null, items = [], onCart }: Props) =>
  renderToStaticMarkup(
    <LoftScene
      birds={birds}
      perches={perches}
      egg={egg}
      items={items}
      onCart={onCart}
    />,
  )
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"');

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1];
const pct = (style: string, prop: string) =>
  Number(style.match(new RegExp(`(?:^|;)${prop}:([\\d.]+)%`))?.[1]);

const links = (html: string) =>
  [...html.matchAll(/<a [^>]*>/g)].map(([tag]) => {
    const style = attr(tag, "style") ?? "";
    return {
      href: attr(tag, "href"),
      label: attr(tag, "aria-label"),
      left: pct(style, "left"),
      top: pct(style, "top"),
      width: pct(style, "width"),
      height: pct(style, "height"),
    };
  });
const linkNamed = (html: string, label: string) =>
  links(html).filter((l) => l.label === label);
const sceneLabel = (html: string) =>
  html.match(/<svg[^>]*role="img"[^>]*aria-label="([^"]*)"/)?.[1] ??
  html.match(/<svg[^>]*aria-label="([^"]*)"[^>]*role="img"/)?.[1];

const unescape = (html: string) =>
  html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"');

const overlay = (html: string) => {
  const start = html.search(/<svg[^>]*data-birds=""/);
  return start < 0 ? "" : html.slice(start, html.lastIndexOf("</svg>") + 6);
};
const birdGroups = (html: string) =>
  [
    ...overlay(html).matchAll(
      /<g data-room="(\d+)" transform="([^"]*)">(.*?<\/svg>)<\/g>/g,
    ),
  ].map(([, room, transform, body]) => ({
    room: Number(room),
    transform,
    body,
  }));

const { scene } = config.loft;
const SMALL_W = scene.minWidth;
const SMALL_H = (SMALL_W * scene.height) / scene.width;

const expectTappable = (link: ReturnType<typeof links>[number]) => {
  expect((link.width / 100) * SMALL_W).toBeGreaterThanOrEqual(44);
  expect((link.height / 100) * SMALL_H).toBeGreaterThanOrEqual(44);
};

const gerald = bird("Gerald");
const kevin = bird("Kevin", { look: "kevin" });

describe("room links (ac-1)", () => {
  it("links an awake bird at home to its page", () => {
    const html = render({ birds: [gerald, kevin], perches: 3 });
    expect(linkNamed(html, "Gerald, at home")).toMatchObject([
      { href: "/birds/gerald" },
    ]);
  });

  it("names a tired bird and a napping bird as asleep", () => {
    const tired = bird("Kevin", { look: "kevin", tired: true });
    const napping = bird("Pip", { status: "busy", busyKind: "nap" });
    const html = render({ birds: [tired, napping], perches: 3 });
    expect(linkNamed(html, "Kevin, asleep")).toMatchObject([
      { href: "/birds/kevin" },
    ]);
    expect(linkNamed(html, "Pip, asleep")).toMatchObject([
      { href: "/birds/pip" },
    ]);
    expect(html).not.toContain("at home");
  });

  it("marks an away bird with a feather in its wing colour and draws no bird", () => {
    const wing = birdLooks.kevin.wing;
    const featherFill = new RegExp(
      `<g transform="rotate\\(-14 [^"]*"><path d="[^"]*" fill="${wing}"`,
    );
    const away = { ...kevin, status: "flying" } as Bird;
    const html = render({ birds: [gerald, away], perches: 3 });
    expect(linkNamed(html, "Kevin, out")).toMatchObject([
      { href: "/birds/kevin" },
    ]);
    expect(html).toMatch(featherFill);
    expect(render({ birds: [gerald, kevin], perches: 3 })).not.toMatch(
      featherFill,
    );
    expect(birdGroups(html).map((g) => g.room)).toEqual([0]);
  });

  it("sends a bird on an odd job out like a flying bird", () => {
    const featherIn = (look: keyof typeof birdLooks) =>
      new RegExp(
        `<g transform="rotate\\(-14 [^"]*"><path d="[^"]*" fill="${birdLooks[look].wing}"`,
      );
    const onJob = bird("Brenda", {
      look: "brenda",
      status: "busy",
      busyKind: "job",
    });
    const away = { ...kevin, status: "flying" } as Bird;
    const birds = [gerald, onJob, away];
    const html = render({ birds, perches: 3 });
    expect(birdGroups(html).map((g) => g.room)).toEqual([0]);
    expect(html).toMatch(featherIn("brenda"));
    expect(html).toMatch(featherIn("kevin"));
    expect(linkNamed(html, "Brenda, out")).toMatchObject([
      { href: "/birds/brenda" },
    ]);
    expect(linkNamed(html, "Kevin, out")).toMatchObject([
      { href: "/birds/kevin" },
    ]);
    expect(sceneLabel(html)).toBe(
      "Your rooftop loft. Gerald sits at home. Brenda and Kevin are out.",
    );
  });

  it("links an owed roommate's room to the roommate page", () => {
    const html = render({ birds: [gerald], perches: 3 });
    expect(linkNamed(html, "A roommate is waiting")).toMatchObject([
      { href: "/aviary/roommate" },
    ]);
  });

  it("links a ready egg to the aviary and wobbles it", () => {
    const html = render({
      birds: [gerald, kevin],
      perches: 3,
      egg: { status: "ready" },
    });
    expect(linkNamed(html, "An egg is ready")).toMatchObject([
      { href: "/aviary" },
    ]);
    expect(html).toContain("coo-wobble");
  });

  it("links an egg that is not ready to the aviary and keeps it still", () => {
    const html = render({
      birds: [gerald, kevin],
      perches: 3,
      egg: { status: "incubating" },
    });
    expect(linkNamed(html, "An egg in its nest")).toMatchObject([
      { href: "/aviary" },
    ]);
    expect(html).not.toContain("coo-wobble");
  });

  it("gives an empty room no link", () => {
    const html = render({ birds: [gerald, kevin], perches: 3 });
    expect(links(html).map((l) => l.label)).toEqual([
      "Gerald, at home",
      "Kevin, at home",
    ]);
  });

  it("links the room to let over its box to the shop", () => {
    const html = render({ birds: [gerald, kevin], perches: 4 });
    const [toLet, ...rest] = linkNamed(html, "Room to let. Open the shop");
    expect(rest).toHaveLength(0);
    expect(toLet).toMatchObject({ href: "/shop" });
    expect(toLet.left).toBeCloseTo((195 / 390) * 100);
    expect(toLet.top).toBeCloseTo((218 / 412) * 100);
  });

  it("gives every room link a 44 px target at a 320 px screen", () => {
    const cases: Props[] = [
      { birds: [gerald, { ...kevin, status: "flying" } as Bird], perches: 4 },
      { birds: [gerald], perches: 5, egg: { status: "ready" } },
    ];
    for (const props of cases) {
      const all = links(render(props));
      expect(all.length).toBeGreaterThanOrEqual(3);
      all.forEach(expectTappable);
    }
  });
});

describe("birdbath (ac-2)", () => {
  const LINK = "Birdbath. Open the shop";

  it("draws no birdbath and no link without the item", () => {
    const html = render({ birds: [gerald], perches: 3 });
    expect(html).not.toContain("coo-twinkle");
    expect(linkNamed(html, LINK)).toHaveLength(0);
  });

  it("draws the birdbath in the left deck slot and links it to the shop", () => {
    const html = render({ birds: [gerald], perches: 3, items: ["birdbath"] });
    expect(html).toContain("coo-twinkle");
    const [link, ...rest] = linkNamed(html, LINK);
    expect(rest).toHaveLength(0);
    expect(link).toMatchObject({ href: "/shop" });
    expect(link.left).toBeCloseTo((8 / 390) * 100);
    expect(link.top).toBeCloseTo((318 / 412) * 100);
    expectTappable(link);
  });
});

describe("espresso cart (#1046 ac-1)", () => {
  const LABEL = "Espresso cart. See espresso shots";
  const { cart } = config.loft.slots;
  const view = (items: LoftItem[], onCart?: () => void) =>
    LoftSceneView({
      rooms: loftRooms([gerald], 3, null),
      perches: 3,
      items,
      motion: { reduced: false, paused: false, gestures: {} },
      onCart,
    });
  const cartButton = (items: LoftItem[], onCart?: () => void) =>
    Children.toArray(view(items, onCart).props.children)
      .filter(isValidElement<{ "aria-label"?: string; onClick?: () => void }>)
      .find((el) => el.props["aria-label"] === LABEL);
  const buttonTag = (html: string) =>
    html.match(new RegExp(`<button[^>]*aria-label="${LABEL}"[^>]*>`))?.[0];

  it("draws a labelled native button over the cart slot when owned", () => {
    const html = render({
      birds: [gerald],
      perches: 3,
      items: ["cart"],
      onCart: () => {},
    });
    const tag = buttonTag(html);
    expect(tag).toContain('type="button"');
    expect(tag).not.toMatch(/tabindex|disabled/);
    const style = attr(tag!, "style") ?? "";
    const box = {
      left: pct(style, "left"),
      top: pct(style, "top"),
      width: pct(style, "width"),
      height: pct(style, "height"),
    };
    expect(box.left).toBeCloseTo(
      ((cart.centerX - cart.width / 2) / scene.width) * 100,
    );
    expect(box.top).toBeCloseTo(
      ((scene.floorY - cart.height) / scene.height) * 100,
    );
    expectTappable(box as ReturnType<typeof links>[number]);
  });

  it("calls onCart when the cart is tapped", () => {
    const onCart = vi.fn();
    cartButton(["cart"], onCart)?.props.onClick?.();
    expect(onCart).toHaveBeenCalledOnce();
  });

  it("has nothing to tap without the cart or without a handler", () => {
    expect(cartButton([], () => {})).toBeUndefined();
    expect(cartButton(["cart"])).toBeUndefined();
    expect(
      buttonTag(render({ birds: [gerald], perches: 3, onCart: () => {} })),
    ).toBeUndefined();
  });
});

describe("scene label (ac-3)", () => {
  it("describes the rooms and draws the clouds", () => {
    const birds = [gerald, bird("Kevin", { look: "kevin", tired: true })];
    const html = render({ birds, perches: 4 });
    expect(sceneLabel(html)).toBe(describeLoft(loftRooms(birds, 4, null)));
    expect(sceneLabel(html)).toBe(
      "Your rooftop loft. Gerald sits at home. Kevin is asleep. Two rooms are free. One room is to let.",
    );
    expect(html).toContain("coo-drift");
  });
});

const brenda = bird("Brenda", { look: "brenda", tired: true });
const flying = bird("Kevin", { look: "kevin", status: "flying" });
const pip = bird("Pip", { look: "dumpling", status: "busy", busyKind: "nap" });
const flock = [gerald, brenda, flying, pip];
const PERCHES = 5;
const flockRooms = loftRooms(flock, PERCHES, null);

const artOf = (b: Bird, pose: "perched" | "sleep") =>
  unescape(
    renderToStaticMarkup(
      <BirdArt
        look={b.look as Look}
        breed={b.breed}
        gear={b.gear as GearId[]}
        size={120}
        pose={pose}
      />,
    ),
  );

const still = { reduced: false, paused: false, gestures: {} };
const view = (motion: Parameters<typeof LoftSceneView>[0]["motion"]) =>
  unescape(
    renderToStaticMarkup(
      <LoftSceneView
        rooms={flockRooms}
        perches={PERCHES}
        items={[]}
        motion={motion}
      />,
    ),
  );

describe("home birds on their perches (ac-1)", () => {
  const html = render({ birds: flock, perches: PERCHES });

  it("draws the birds in an overlay with the art's viewBox", () => {
    const [art, birds] = [...html.matchAll(/<svg[^>]*>/g)].map(([t]) => t);
    expect(attr(art, "viewBox")).toBe(`0 0 ${scene.width} ${scene.height}`);
    expect(birds).toContain('data-birds=""');
    expect(attr(birds, "viewBox")).toBe(attr(art, "viewBox"));
    expect(attr(birds, "aria-hidden")).toBe("true");
  });

  it("draws each home bird once, in flock order", () => {
    const groups = birdGroups(html);
    expect(groups.map((g) => g.room)).toEqual([0, 1, 3]);
    for (const g of groups) expect(g.body.match(/<svg/g)).toHaveLength(1);
  });

  it("stands each bird's feet on its own perch", () => {
    const layout = loftLayout(PERCHES);
    const [, vy, vw] = PERCH_VB.split(" ").map(Number);
    const { feetY, feetYInBirdViewBox } = config.loft.rooms.bird;
    const groups = birdGroups(html);
    expect(groups).toHaveLength(3);
    for (const { room, transform, body } of groups) {
      const box = birdBox(layout.rooms[room]);
      expect(transform).toBe(
        `translate(${box.x} ${box.y}) scale(${box.w / 120})`,
      );
      expect(body).toMatch(/^<g[^>]*><svg[^>]* width="120"/);
      expect(box.y + ((feetYInBirdViewBox - vy) * box.w) / vw).toBeCloseTo(
        layout.rooms[room].y + feetY,
      );
    }
  });

  it("draws asleep birds sleeping and awake birds perched", () => {
    const [g, b, p] = birdGroups(html).map((x) => x.body);
    expect(g).toContain(artOf(gerald, "perched"));
    expect(b).toContain(artOf(brenda, "sleep"));
    expect(p).toContain(artOf(pip, "sleep"));
    expect(g).not.toContain(">z</text>");
  });
});

type Motion = ReturnType<typeof useLoftMotion>;

let root: Root | null = null;
let reduce = false;
let doc: EventTarget & { hidden: boolean };
const seen: Motion[] = [];

function Probe({ ids }: { ids: readonly string[] }) {
  seen.push(useLoftMotion(ids));
  return null;
}

const mount = async (ids: readonly string[]) => {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  root = createRoot(container);
  await act(async () => root!.render(<Probe ids={ids} />));
};

const longestGesture = Math.max(...Object.values(GESTURES).map((g) => g.ms));
const runIdle = async () => {
  const until = REST_MS.min + REST_MS.max + longestGesture * 2;
  for (let t = 0; t < until; t += 200)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
};

beforeEach(() => {
  vi.useFakeTimers();
  reduce = false;
  seen.length = 0;
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

describe("idle gestures (ac-2)", () => {
  it("counts only awake home birds as awake", () => {
    expect(awakeIds(flockRooms)).toEqual(["gerald"]);
  });

  it("plays gestures for awake birds and never for asleep ones", async () => {
    await mount(awakeIds(flockRooms));
    await runIdle();
    const played = seen.flatMap((m) => Object.keys(m.gestures));
    expect(played).toContain("gerald");
    expect(played).not.toContain("brenda");
    expect(played).not.toContain("pip");
    expect(seen.every((m) => !m.reduced && !m.paused)).toBe(true);
  });

  it("animates the awake bird's group with the gesture, not the asleep birds", async () => {
    await mount(awakeIds(flockRooms));
    await runIdle();
    const gesture = seen.find((m) => m.gestures.gerald)!.gestures
      .gerald as Gesture;
    const html = view({
      ...still,
      gestures: { gerald: gesture, brenda: gesture, pip: gesture },
    });
    const [g, b, p] = birdGroups(html).map((x) => x.body);
    expect(g).toMatch(
      new RegExp(
        `^<g data-idle="${gesture}" style="[^"]*animation:${gestureAnimation(gesture).replace(/[()]/g, "\\$&")}`,
      ),
    );
    expect(b).not.toContain("data-idle");
    expect(p).not.toContain("data-idle");
  });
});

describe("clouds and motion (ac-3)", () => {
  it("draws two drifting clouds", () => {
    const html = render({ birds: flock, perches: PERCHES });
    expect(html.match(/coo-drift/g)).toHaveLength(2);
  });

  it("plays no gestures with reduced motion", async () => {
    reduce = true;
    await mount(awakeIds(flockRooms));
    await runIdle();
    expect(seen.at(-1)!.reduced).toBe(true);
    expect(seen.every((m) => Object.keys(m.gestures).length === 0)).toBe(true);
  });

  it("animates nothing in the scene with reduced motion", () => {
    const html = view({
      reduced: true,
      paused: false,
      gestures: { gerald: "hop" },
    });
    expect(overlay(html)).not.toContain("animation");
    expect(overlay(html)).not.toContain("data-idle");
    expect(html).not.toContain("<animate");
    const motionCss = readFileSync("public/assets/motion.css", "utf8");
    expect(motionCss).toContain(
      "@media (prefers-reduced-motion: reduce){*{animation:none !important}}",
    );
  });

  it.each([
    ["full motion", false],
    ["reduced motion", true],
  ])("pauses while the tab is hidden with %s", async (_, reduced) => {
    reduce = reduced;
    await mount(awakeIds(flockRooms));
    expect(seen.at(-1)!.paused).toBe(false);
    await act(async () => {
      doc.hidden = true;
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    expect(seen.at(-1)!.paused).toBe(true);
    await act(async () => {
      doc.hidden = false;
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    expect(seen.at(-1)!.paused).toBe(false);
  });

  it("marks the whole scene paused so every animation stops", () => {
    const html = view({ ...still, paused: true });
    expect(html).toMatch(/^<div[^>]* data-paused="">/);
    expect(html.match(/^<div[^>]*>(<svg.*<\/svg>)/)?.[1]).toContain(
      'data-birds=""',
    );
    expect(view(still)).not.toContain("data-paused");
    const css = readFileSync("src/app/(app)/LoftScene.module.css", "utf8");
    expect(css.replace(/\s+/g, " ")).toContain(
      ".loft[data-paused] * { animation-play-state: paused !important; }",
    );
  });
});
