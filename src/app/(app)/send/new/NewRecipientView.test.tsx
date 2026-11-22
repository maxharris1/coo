import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import emptyStates from "../../../../../assets/copy/empty-states.json";
import type { PlaceResult } from "../../welcome/loft/roost";
import type { Picked } from "./newRecipient";
import { NewRecipientView } from "./NewRecipientView";

type Props = ComponentProps<typeof NewRecipientView>;

const FISHTOWN: PlaceResult = {
  placeId: "p1",
  label: "Fishtown, Philadelphia",
  sublabel: "Philadelphia, PA",
  kind: "neighbourhood",
};
const PHILLY: PlaceResult = {
  placeId: "p2",
  label: "Philadelphia, PA",
  sublabel: "Pennsylvania",
  kind: "city",
};
const STREET: PlaceResult = {
  placeId: "p3",
  label: "Frankford Ave, Philadelphia",
  sublabel: "Fishtown",
  kind: "address",
};

const START = { lat: 39.9726, lon: -75.1349 };
const PICKED: Picked = {
  placeId: "p1",
  label: "Fishtown, Philadelphia",
  spot: { start: START, pin: START },
};

const PLACE_NOT_FOUND = emptyStates.find(
  (s) => s.state === "Place not found",
)!.text;

const props = (over: Partial<Props> = {}): Props => ({
  name: "Maya",
  query: "Fishtown, Philadelphia",
  search: {
    kind: "results",
    query: "Fishtown, Philadelphia",
    results: [FISHTOWN, PHILLY, STREET],
  },
  picked: PICKED,
  onName: () => {},
  onQuery: () => {},
  onPick: () => {},
  onPin: () => {},
  ...over,
});

const render = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(<NewRecipientView {...props(over)} />).replaceAll(
    "&#x27;",
    "'",
  );

const rowFor = (html: string, label: string) =>
  html
    .split("<button")
    .find((chunk) => chunk.includes(`>${label}<`))!
    .split("</button>")[0];

const MAP = 'aria-label="Map of Fishtown, Philadelphia with your roost pin"';

const nextControl = (html: string) =>
  html.match(/<(a|span)[^>]*>Next: write the note<\/\1>/)![0];

describe("NewRecipientView (ac-2)", () => {
  it("draws the mock's copy", () => {
    const html = render();
    expect(html).toContain(">Someone new</h1>");
    expect(html).toMatch(/<label[^>]*for="r-name"[^>]*>Their name<\/label>/);
    expect(html).toMatch(
      /<label[^>]*for="r-place"[^>]*>Where should the bird fly\?<\/label>/,
    );
    expect(html).toContain('value="Maya"');
    expect(html).toContain('maxLength="30"');
    expect(html).toContain('value="Fishtown, Philadelphia"');
    expect(html).toContain("How Maya gets it");
    expect(html).toContain(
      "You write the note and release a bird, same as always.",
    );
    expect(html).toContain("We hand you a private link to text them.");
    expect(html).toContain(
      "They watch the flight. The note opens when the bird lands.",
    );
    expect(html).toContain("Next: write the note");
  });

  it("goes back to the address book", () => {
    const back = render().match(/<a[^>]*aria-label="Back[^>]*>/)![0];
    expect(back).toContain('href="/send"');
  });

  it("labels each place with the helper for its kind", () => {
    const html = render();
    expect(rowFor(html, "Fishtown, Philadelphia")).toContain(
      "A neighborhood is plenty",
    );
    expect(rowFor(html, "Philadelphia, PA")).toContain("Anywhere in the city");
    expect(rowFor(html, "Frankford Ave, Philadelphia")).toContain(
      "Shown to nobody. Rounded to the nearest roost.",
    );
  });

  it("marks only the picked place pressed, with the check", () => {
    const html = render();
    const picked = rowFor(html, "Fishtown, Philadelphia");
    const other = rowFor(html, "Philadelphia, PA");
    expect(picked).toContain('aria-pressed="true"');
    expect(picked).toContain("M5 12.5 L10 17.5 L19 7");
    expect(other).toContain('aria-pressed="false"');
    expect(other).not.toContain("M5 12.5 L10 17.5 L19 7");
  });

  it("links Next to Compose with the guest once a name and place are set", () => {
    const next = nextControl(render());
    expect(next).toMatch(/^<a/);
    expect(next).toContain('href="/send/write?guest=Maya&amp;place=p1"');
  });

  it("leaves Next without a link until a place is picked", () => {
    const next = nextControl(render({ picked: null }));
    expect(next).not.toContain("href=");
    expect(next).toContain('aria-disabled="true"');
  });

  it("leaves Next without a link until there is a name", () => {
    const html = render({ name: "" });
    expect(nextControl(html)).not.toContain("href=");
    expect(html).toContain("How they get it");
  });

  it("says it is looking while the search runs", () => {
    const html = render({
      search: { kind: "loading", query: "Fish" },
      picked: null,
    });
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("aria-pressed");
  });

  it("says so when no place matches", () => {
    const html = render({
      search: { kind: "results", query: "Zzz", results: [] },
      picked: null,
    });
    expect(html).toContain(PLACE_NOT_FOUND);
    expect(html).not.toContain("aria-pressed");
  });

  it("shows no rows when the search failed, since the toast says why", () => {
    const html = render({
      search: { kind: "failed", query: "Fish" },
      picked: null,
    });
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain(PLACE_NOT_FOUND);
  });

  it("shows no rows before anything is typed", () => {
    const html = render({
      query: "",
      search: { kind: "idle" },
      picked: null,
    });
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain(PLACE_NOT_FOUND);
  });

  it("shows no map before a place is picked", () => {
    expect(render({ picked: null })).not.toContain("Map of");
  });

  it("shows no map while the place's starting point is on its way", () => {
    const html = render({ picked: { ...PICKED, spot: null } });
    expect(html).not.toContain("Map of");
    expect(rowFor(html, "Fishtown, Philadelphia")).toContain(
      'aria-pressed="true"',
    );
    expect(nextControl(html)).toContain(
      'href="/send/write?guest=Maya&amp;place=p1"',
    );
  });

  it("puts a draggable pin on a map of the picked place", () => {
    const html = render();
    expect(html).toMatch(new RegExp(`role="group"[^>]*${MAP}`));
    expect(html).toMatch(
      /role="button"[^>]*aria-label="Roost pin at Fishtown, Philadelphia. Arrow keys move it one block."/,
    );
    expect(rowFor(html, "Fishtown, Philadelphia")).toContain(
      'aria-pressed="true"',
    );
    expect(nextControl(html)).toContain(
      'href="/send/write?guest=Maya&amp;place=p1"',
    );
  });
});
