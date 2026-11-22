import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LocalDate } from "@/lib/game/time";
import type { MoreSources } from "./more";
import { MoreView } from "./MoreView";

const MOCK: MoreSources = {
  sync: {
    friendsCount: 4,
    egg: { status: "incubating", deliveriesToGo: 6 },
    punchCard: {
      weekStart: "2026-11-16" as LocalDate,
      deliveries: 6,
      size: 10,
      paid: false,
    },
    me: { settings: { quietOn: true } },
  },
  friends: { invitesOut: 1 },
  notes: { total: 23 },
  collection: { postmarks: 4, badges: 2 },
};

const MOCK_CARDS = [
  ["/friends", "Friends", "4 friends, 1 invite out"],
  ["/shoebox", "Shoebox", "23 notes saved"],
  ["/collection", "Collection", "4 postmarks, 2 badges"],
  ["/aviary", "Aviary", "Egg hatches in 6 deliveries"],
  ["/earn", "Earn seeds", "Punch card at 6 of 10"],
  ["/settings", "Settings", "Quiet hours are on"],
];

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cards = (sources: MoreSources) => {
  const html = renderToStaticMarkup(<MoreView sources={sources} />);
  return [...html.matchAll(/<a [^>]*href="(\/[a-z]+)"[^>]*>(.*?)<\/a>/g)]
    .filter((m) => m[1] !== "/")
    .map((m) => ({
      href: m[1],
      lines: [...m[2].matchAll(/<(?:span|p)[^>]*>([^<]+)<\/(?:span|p)>/g)].map(
        (l) => l[1],
      ),
      name: text(m[2]),
    }));
};

describe("MoreView", () => {
  it("heads the screen with a back link to the loft and the Post office title", () => {
    const html = renderToStaticMarkup(<MoreView sources={MOCK} />);
    const header = html.match(/<header[^>]*>(.*?)<\/header>/)![1];
    const back = header.match(/<a [^>]*>/)![0];
    expect(back).toContain('href="/"');
    expect(back).toContain('aria-label="Back to the loft"');
    expect(header).toContain('d="M15 5 L8 12 L15 19"');
    expect(header).toMatch(/<h1[^>]*>Post office<\/h1>/);
  });

  it("shows the six cards in the mock's order with the mock's lines", () => {
    expect(cards(MOCK).map((c) => [c.href, ...c.lines])).toEqual(MOCK_CARDS);
  });

  it("gives every card an accessible name from its title and line", () => {
    expect(cards(MOCK).map((c) => c.name)).toEqual(
      MOCK_CARDS.map(([, title, sub]) => `${title} ${sub}`),
    );
  });

  it("hides the icons from assistive tech", () => {
    const html = renderToStaticMarkup(<MoreView sources={MOCK} />);
    const svgs = [...html.matchAll(/<svg[^>]*>/g)].map((m) => m[0]);
    expect(svgs).toHaveLength(7);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
  });

  it("drops only the line whose source is missing and keeps every link", () => {
    const shown = cards({ ...MOCK, notes: null });
    expect(shown.map((c) => c.href)).toEqual(MOCK_CARDS.map(([href]) => href));
    expect(shown.map((c) => c.lines)).toEqual(
      MOCK_CARDS.map(([, title, sub]) =>
        title === "Shoebox" ? [title] : [title, sub],
      ),
    );
    expect(
      renderToStaticMarkup(<MoreView sources={{ ...MOCK, notes: null }} />),
    ).not.toContain("notes saved");
  });
});
