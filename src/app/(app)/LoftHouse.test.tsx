import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import birdLooks from "../../../public/assets/data/birds.json";
import { describeLoft, loftRooms } from "./flockRows";
import { LoftHouse } from "./LoftHouse";
import type { LoftItem } from "./loftArt";

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
};

const render = ({ birds, perches, egg = null, items = [] }: Props) =>
  renderToStaticMarkup(
    <LoftHouse birds={birds} perches={perches} egg={egg} items={items} />,
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
    expect(html.match(/<svg/g)).toHaveLength(1);
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
