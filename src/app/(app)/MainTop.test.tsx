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

type Extra = {
  perches?: number;
  hasBirdbath?: boolean;
  egg?: SyncPayload["egg"];
};

const data = (
  birds: Bird[],
  seeds = 240,
  unread = 0,
  { perches = 4, hasBirdbath = false, egg = null }: Extra = {},
) =>
  ({
    me: {
      seeds,
      timezone: "America/New_York",
      loft: null,
      perches,
      hasBirdbath,
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
    expect(html).not.toContain("/assets/svg/illustrations/coop.svg");
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
