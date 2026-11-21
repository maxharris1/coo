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

  it("greets by time of day with birds home and away counted in words", () => {
    expect(html).toMatch(
      /<h1[^>]*>Morning. Three birds home, one out on a job.<\/h1>/,
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

  it("puts the awake home birds on the ledge, at most two", () => {
    const five = render([...mock, bird("Pip"), bird("Dot")]);
    expect(five.match(/data-ledge-bird/g)).toHaveLength(2);
    expect(html.match(/data-ledge-bird/g)).toHaveLength(2);
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
