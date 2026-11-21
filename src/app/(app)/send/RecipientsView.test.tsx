import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { Card, SillCard } from "./recipients";
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

const sill: SillCard[] = [
  {
    visitId: "v1",
    name: "Priya",
    line: "Dumpling is waiting. A reply rides home free.",
  },
];

type Extra = {
  sill?: SillCard[];
  contacts?: { supported: boolean; names: string[] };
};

const render = (
  picked: string[],
  readyCount = 2,
  list: RecipientList = { kind: "ready", cards },
  query = "",
  extra: Extra = {},
) =>
  renderToStaticMarkup(
    <RecipientsView
      list={list}
      sill={extra.sill ?? []}
      contacts={extra.contacts ?? { supported: false, names: [] }}
      picked={new Set(picked)}
      readyCount={readyCount}
      query={query}
      onQuery={() => {}}
      onToggle={() => {}}
      onPickContacts={() => {}}
      onOpenContact={() => {}}
    />,
  ).replaceAll("&#x27;", "'");

const linkFor = (html: string, name: string) => {
  const link = html.split("<a ").find((chunk) => chunk.includes(`>${name}<`));
  if (!link) throw new Error(`no link for ${name}`);
  return link.slice(0, link.indexOf("</a>"));
};

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

  it("filters friends by name and keeps each friend's avatar colour", () => {
    const tone = (html: string) =>
      rowFor(html, "Rosa").match(/avatar ([^"]+)"/)?.[1];
    const all = render([]);
    const searched = render([], 2, { kind: "ready", cards }, "ros");
    expect(searched).toContain(">Rosa<");
    expect(searched).not.toContain(">Theo<");
    expect(tone(searched)).toBe(tone(all));
    expect(render([], 2, { kind: "ready", cards }, "zz")).toContain(
      "Nobody by that name.",
    );
  });
});

describe("RecipientsView sill, contacts and search (ac-1)", () => {
  const contacts = { supported: true, names: ["Maya Okafor", "Jordan Bell"] };

  it("puts sill birds first, as free rides that link to Reply", () => {
    const html = render([], 2, { kind: "ready", cards }, "", { sill });
    const sillAt = html.indexOf("A bird of theirs is on your sill");
    expect(sillAt).toBeGreaterThan(-1);
    expect(sillAt).toBeLessThan(html.indexOf(">Friends<"));
    const row = linkFor(html, "Priya");
    expect(row).toContain('href="/sill/v1/reply"');
    expect(row).toContain("Dumpling is waiting. A reply rides home free.");
    expect(row).toContain("Free ride");
  });

  it("hides the sill section when nothing is on the sill", () => {
    expect(render([])).not.toContain("A bird of theirs is on your sill");
  });

  it("offers From your contacts only where the picker exists", () => {
    const button = /<button [^>]*>From your contacts<\/button>/;
    expect(render([])).not.toMatch(button);
    expect(
      render([], 2, { kind: "ready", cards }, "", {
        contacts: { supported: true, names: [] },
      }),
    ).toMatch(button);
  });

  it("shows picked contacts as By link rows that open NewRecipient", () => {
    const html = render([], 2, { kind: "ready", cards }, "", { contacts });
    expect(html).toContain(">From your contacts<");
    expect(html).toContain("Goes by text link");
    for (const name of contacts.names) {
      const row = linkFor(html, name);
      expect(row).toContain('href="/send/new"');
      expect(row).toContain(
        `Not on ${config.app.name} yet. Add where the bird should fly.`,
      );
      expect(row).toContain("By link");
    }
    expect(html.indexOf(">Friends<")).toBeLessThan(
      html.indexOf(">From your contacts<"),
    );
  });

  it("filters sill, friend and contact rows by the search", () => {
    const html = render([], 2, { kind: "ready", cards }, "a", {
      sill,
      contacts,
    });
    for (const name of ["Priya", "Rosa", "Sam", "Maya Okafor", "Jordan Bell"])
      expect(html).toContain(`>${name}<`);
    expect(html).not.toContain(">Theo<");

    const narrow = render([], 2, { kind: "ready", cards }, "maya", {
      sill,
      contacts,
    });
    expect(narrow).toContain(">Maya Okafor<");
    expect(narrow).not.toContain(">Jordan Bell<");
    expect(narrow).not.toContain(">Priya<");
    expect(narrow).not.toContain("A bird of theirs is on your sill");
  });
});
