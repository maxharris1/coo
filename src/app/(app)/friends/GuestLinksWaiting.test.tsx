import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestLinksWaiting } from "./GuestLinksWaiting";

const render = (links: { id: string; name: string; where: string }[]) =>
  renderToStaticMarkup(<GuestLinksWaiting links={links} />);

describe("GuestLinksWaiting (ac-2)", () => {
  it("renders nothing when no guest link is waiting", () => {
    expect(render([])).toBe("");
  });

  it("titles the section as drawn", () => {
    const html = render([{ id: "g", name: "Maya", where: "Fishtown" }]);
    expect(html).toMatch(/<section[^>]*aria-labelledby="waiting-title"/);
    expect(html).toMatch(/<h2 id="waiting-title"[^>]*>Waiting on a link<\/h2>/);
  });

  it("draws one row per link with initial, name, place and a Pending pill", () => {
    const html = render([
      { id: "g1", name: "maya", where: "Fishtown" },
      { id: "g2", name: "Sam", where: "Boston" },
    ]);
    const rows = html.match(/<li[\s\S]*?<\/li>/g) ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/aria-hidden="true"[^>]*>M<\/span>/);
    expect(rows[0]).toContain(">maya<");
    expect(rows[0]).toContain("Link sent. Flying to Fishtown.");
    expect(rows[0]).toContain(">Pending<");
    expect(rows[1]).toContain("Link sent. Flying to Boston.");
  });

  it("keeps the rows static because the link is shown once", () => {
    const html = render([{ id: "g", name: "Maya", where: "Fishtown" }]);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<button");
  });
});
