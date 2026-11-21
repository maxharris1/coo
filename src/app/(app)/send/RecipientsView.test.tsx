import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Card } from "./recipients";
import { RecipientsView, type RecipientList } from "./RecipientsView";

const cards: Card[] = [
  {
    kind: "friend",
    id: "theo",
    name: "Theo",
    line: "Boston, 190 mi. About 4h 13m.",
  },
  {
    kind: "friend",
    id: "rosa",
    name: "Rosa",
    line: "3 blocks over. About 30 seconds.",
  },
  { kind: "unreachable", id: "sam", name: "Sam", reason: "No loft yet." },
];

const render = (
  picked: string[],
  readyCount = 2,
  list: RecipientList = { kind: "ready", cards },
) =>
  renderToStaticMarkup(
    <RecipientsView
      list={list}
      picked={new Set(picked)}
      readyCount={readyCount}
      query=""
      onQuery={() => {}}
      onToggle={() => {}}
    />,
  ).replaceAll("&#x27;", "'");

const rowFor = (html: string, name: string) => {
  const row = html
    .split("<button")
    .find((chunk) => chunk.includes(`>${name}<`));
  if (!row) throw new Error(`no row for ${name}`);
  return row.slice(0, row.indexOf("</button>"));
};

describe("RecipientsView (ac-1)", () => {
  it("shows the header, the search box and the Friends section", () => {
    const html = render([]);
    expect(html).toContain("Who's it for?");
    const back = html.match(/<a [^>]*aria-label="Back to the loft"[^>]*>/);
    expect(back?.[0]).toContain('href="/"');
    expect(html).toContain('aria-label="Search friends and contacts"');
    expect(html).toContain(">Friends<");
    expect(html).toContain("Flight time from your loft");
    expect(html).toContain("Boston, 190 mi. About 4h 13m.");
    expect(html).toContain("3 blocks over. About 30 seconds.");
  });

  it("marks a picked friend pressed and leaves the others unpressed", () => {
    const html = render(["theo"]);
    expect(rowFor(html, "Theo")).toContain('aria-pressed="true"');
    expect(rowFor(html, "Rosa")).toContain('aria-pressed="false"');
    expect(html).toContain("1 picked. That takes 1 bird, and 2 are ready.");
  });

  it("greys a friend who cannot be reached and says why", () => {
    const row = rowFor(render([]), "Sam");
    expect(row).toContain("disabled");
    expect(row).toContain("No loft yet.");
    expect(row).not.toContain("aria-pressed");
  });

  it("links Someone new to the new recipient screen", () => {
    expect(render([])).toMatch(/<a [^>]*href="\/send\/new"[^>]*>.*Someone new/);
  });

  it("links Next to Compose with the picks when enough birds are ready", () => {
    const html = render(["theo", "rosa"]);
    expect(html).toMatch(
      /<a [^>]*href="\/send\/write\?to=theo&amp;to=rosa"[^>]*>Next<\/a>/,
    );
  });

  it("disables Next when more people are picked than birds are ready", () => {
    const html = render(["theo", "rosa"], 1);
    expect(html).toMatch(/<button [^>]*disabled=""[^>]*>Next<\/button>/);
    expect(html).not.toContain("/send/write");
    expect(html).toContain("2 picked. That takes 2 birds, and 1 is ready.");
  });

  it("disables Next until someone is picked", () => {
    expect(render([])).toMatch(/<button [^>]*disabled=""[^>]*>Next<\/button>/);
  });

  it("shows the loader while friends load and still offers Someone new", () => {
    const html = render([], 2, { kind: "loading" });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Someone new");
  });

  it("says so when there are no friends yet", () => {
    const html = render([], 2, { kind: "ready", cards: [] });
    expect(html).toContain("No friends yet. Send to someone new.");
    expect(html).toContain("Someone new");
  });
});
