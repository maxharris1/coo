import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import emptyStates from "../../../../../assets/copy/empty-states.json";
import type { PickerOption } from "./compose";
import { type ComposeRow, ComposeView, NoRecipient } from "./ComposeView";

type Props = ComponentProps<typeof ComposeView>;

const NOTE =
  "Dinner Saturday? I'll bring the good bread. Do NOT tell Gerald about the bread.";

const GERALD: PickerOption = {
  id: "b1",
  name: "Gerald",
  speed: "45 mph",
  look: "gerald",
  breed: "city",
  gear: [],
  chip: "Ready",
  state: { kind: "ready" },
  wakes: false,
};

const CRUMBS: PickerOption = {
  id: "b2",
  name: "Adm. Crumbs",
  speed: "52 mph",
  look: "admiral",
  breed: "city",
  gear: [],
  chip: "Hungry",
  state: { kind: "hungry", warning: "Hungry. Can fly, but the odds drop." },
  wakes: false,
};

const KEVIN: PickerOption = {
  id: "b3",
  name: "Kevin",
  speed: "38 mph",
  look: "kevin",
  breed: "city",
  gear: [],
  chip: "Napping",
  state: { kind: "blocked", reason: "Napping. Can't fly yet." },
  wakes: true,
};

const STATS = {
  distance: "81 mi",
  flightTime: "1h 48m",
  odds: "94%",
  forecast: "Lands around 11:20 am. Clear skies over Jersey.",
};

const PRIYA_ROW: ComposeRow = {
  friendId: "u2",
  recipient: {
    name: "Priya",
    line: "Philadelphia, 81 miles as the pigeon flies",
  },
  pickedId: "b1",
  tooLong: false,
  stats: STATS,
  forecastHref: "/send/forecast?to=u2",
};

const props = (over: Partial<Props> = {}): Props => ({
  rows: [PRIYA_ROW],
  note: NOTE,
  counter: { text: "79 of 140 characters", over: false },
  birds: [GERALD, CRUMBS, KEVIN],
  sending: false,
  onNote: () => {},
  onPick: () => {},
  onRelease: () => {},
  onWake: () => {},
  ...over,
});

const render = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(<ComposeView {...props(over)} />).replaceAll(
    "&#x27;",
    "'",
  );

const one = (row: Partial<ComposeRow>, over: Partial<Props> = {}) =>
  render({ rows: [{ ...PRIYA_ROW, ...row }], ...over });

const buttonWith = (html: string, text: string) => {
  const chunk = html
    .split("<button")
    .slice(1)
    .find((c) => c.slice(0, c.indexOf("</button>")).includes(text));
  if (!chunk) throw new Error(`no button with ${text}`);
  return {
    tag: chunk.slice(0, chunk.indexOf(">")),
    body: chunk.slice(0, chunk.indexOf("</button>")),
  };
};

const releaseButton = (html: string) => buttonWith(html, "Release").tag;

const noRested = emptyStates.find((s) => s.state === "No rested birds")!.text;

describe("ComposeView (ac-1)", () => {
  it("shows the mock's header, recipient card, note and Release", () => {
    const html = render();
    expect(html).toContain("<h1");
    expect(html).toContain("New pigeon post");
    expect(html).toContain('aria-label="Back to the address book"');
    expect(html).toContain(">P<");
    expect(html).toContain("To Priya");
    expect(html).toContain("Philadelphia, 81 miles as the pigeon flies");
    expect(html).toContain("Your note");
    expect(html).toContain(`>${NOTE}</textarea>`);
    expect(html).toContain("79 of 140 characters");
    expect(html).toContain("It has to fit on one leg");
    expect(html).toContain("Release Gerald");
    expect(html).toContain("No take-backs once the bird is airborne.");
  });

  it("links back and Change to the address book", () => {
    const html = render();
    const links = (html.match(/<a [^>]*>/g) ?? []).filter(
      (link) => !link.includes("forecast"),
    );
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toContain('href="/send"');
    expect(html).toContain(">Change</a>");
  });

  it("labels the note field", () => {
    const html = render();
    expect(html).toMatch(/<label for="note"[^>]*>Your note<\/label>/);
    expect(html).toMatch(/<textarea[^>]*id="note"/);
  });

  it("enables Release for a note that fits and a ready bird", () => {
    expect(releaseButton(render())).not.toContain("disabled");
  });

  it.each([
    ["the note is empty", { note: "" }],
    ["the note is only spaces", { note: "   " }],
    [
      "the note is over the limit",
      { counter: { text: "141 of 140 characters", over: true } },
    ],
    ["a release is in flight", { sending: true }],
    ["no bird is ready", { rows: [{ ...PRIYA_ROW, pickedId: null }] }],
  ] as const)("disables Release when %s", (_, over) => {
    expect(releaseButton(render(over))).toContain("disabled");
  });

  it("says nobody is rested when no bird is ready", () => {
    const html = one({ pickedId: null });
    expect(html).toContain(noRested);
    expect(html).not.toContain("Release Gerald");
  });

  it("hints that a napper can be woken when no bird is ready", () => {
    expect(one({ pickedId: null })).toContain("wake a napper");
  });
});

describe("ComposeView picker (ac-1)", () => {
  it("lists every bird under Who's flying? with speed and state", () => {
    const html = render();
    expect(html).toMatch(/<h2[^>]*>Who's flying\?<\/h2>/);
    for (const [name, speed, chip] of [
      ["Gerald", "45 mph", "Ready"],
      ["Adm. Crumbs", "52 mph", "Hungry"],
      ["Kevin", "38 mph", "Napping"],
    ]) {
      const { body } = buttonWith(html, name);
      expect(body).toContain(speed);
      expect(body).toContain(chip);
    }
  });

  it("draws each bird's face", () => {
    const { body } = buttonWith(render(), "Gerald");
    expect(body).toContain("<svg");
  });

  it("marks the picked bird pressed and the others not", () => {
    const html = one({ pickedId: "b2" });
    expect(buttonWith(html, "Adm. Crumbs").tag).toContain(
      'aria-pressed="true"',
    );
    expect(buttonWith(html, "Gerald").tag).toContain('aria-pressed="false"');
    expect(html).toContain("Release Adm. Crumbs");
  });

  it("disables a blocked bird and says why", () => {
    const kevin = buttonWith(render(), "Kevin");
    expect(kevin.tag).toContain("disabled");
    expect(kevin.body).toContain("Napping. Can't fly yet.");
  });

  it("offers Wake beside the napping bird only, and keeps it unpickable", () => {
    const html = render();
    expect(count(html, ">Wake</button>")).toBe(1);
    expect(buttonWith(html, ">Wake").tag).toContain('aria-label="Wake Kevin"');
    expect(buttonWith(html, "Kevin").tag).toContain("disabled");
  });

  it("keeps ready and hungry birds pickable", () => {
    const html = render();
    expect(buttonWith(html, "Gerald").tag).not.toContain("disabled");
    expect(buttonWith(html, "Adm. Crumbs").tag).not.toContain("disabled");
  });

  it("warns when the picked bird is hungry", () => {
    expect(one({ pickedId: "b2" })).toContain(
      "Hungry. Can fly, but the odds drop.",
    );
    expect(render()).not.toContain("Can fly, but the odds drop.");
  });
});

describe("ComposeView stats (ac-2)", () => {
  it("shows the three stats and the forecast line from the quote", () => {
    const html = render();
    for (const [value, label] of [
      ["81 mi", "Distance"],
      ["1h 48m", "Flight time"],
      ["94%", "Arrival odds"],
    ])
      expect(html).toMatch(
        new RegExp(`>${value}</span><span[^>]*>${label}</span>`),
      );
    expect(html).toContain("Lands around 11:20 am. Clear skies over Jersey.");
  });

  it("links to the Forecast", () => {
    expect(render()).toMatch(
      /<a [^>]*href="\/send\/forecast\?to=u2"[^>]*>Forecast<\/a>/,
    );
  });

  it("holds the stats back until the quote arrives", () => {
    const html = one({ stats: null });
    expect(html).not.toContain("Arrival odds");
    expect(html).not.toContain("Lands around");
  });

  it("lays the screen out in the mock's order", () => {
    const html = render();
    const order = [
      "New pigeon post",
      "To Priya",
      "Your note",
      "Who's flying?",
      "Arrival odds",
      ">Forecast<",
      "Release Gerald",
      "No take-backs",
    ].map((text) => html.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

type Handlers = {
  type?: string;
  className?: string;
  disabled?: boolean;
  "aria-pressed"?: boolean;
  "aria-label"?: string;
  children?: ReactNode;
  onChange?: (e: { target: { value: string } }) => void;
  onClick?: () => void;
};

const elements = (node: ReactNode): ReactElement<Handlers>[] => {
  if (!isValidElement<Handlers>(node)) return [];
  if (typeof node.type === "function")
    return elements((node.type as (props: Handlers) => ReactNode)(node.props));
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
};

describe("ComposeView events (ac-2)", () => {
  it("passes typing to onNote", () => {
    const onNote = vi.fn();
    const field = elements(ComposeView(props({ onNote }))).find(
      (e) => e.type === "textarea",
    );
    field?.props.onChange?.({ target: { value: "Hi Priya" } });
    expect(onNote).toHaveBeenCalledExactlyOnceWith("Hi Priya");
  });

  it("passes a bird tap to onPick", () => {
    const onPick = vi.fn();
    const crumbs = elements(ComposeView(props({ onPick }))).find(
      (e) => e.props["aria-pressed"] === false && !e.props.disabled,
    );
    crumbs?.props.onClick?.();
    expect(onPick).toHaveBeenCalledExactlyOnceWith("u2", "b2");
  });

  it("passes a Wake tap to onWake with the napping bird", () => {
    const onWake = vi.fn();
    const wake = elements(ComposeView(props({ onWake }))).find(
      (e) => e.props["aria-label"] === "Wake Kevin",
    );
    wake?.props.onClick?.();
    expect(onWake).toHaveBeenCalledExactlyOnceWith("b3");
  });

  it("passes the Release tap to onRelease", () => {
    const onRelease = vi.fn();
    const button = elements(ComposeView(props({ onRelease }))).find((e) =>
      e.props.className?.includes("release"),
    );
    button?.props.onClick?.();
    expect(onRelease).toHaveBeenCalledOnce();
  });
});

const ALEX_ROW: ComposeRow = {
  friendId: "u3",
  recipient: { name: "Alex", line: "Boston, 215 miles as the pigeon flies" },
  pickedId: "b2",
  tooLong: false,
  stats: { ...STATS, distance: "215 mi" },
  forecastHref: "/send/forecast?to=u3",
};

const SAM_ROW: ComposeRow = {
  friendId: "u4",
  recipient: { name: "Sam", line: "Albany, 136 miles as the pigeon flies" },
  pickedId: "b4",
  tooLong: false,
  stats: { ...STATS, distance: "136 mi" },
  forecastHref: "/send/forecast?to=u4",
};

const PIP: PickerOption = { ...GERALD, id: "b4", name: "Pip", speed: "30 mph" };

const three = (over: Partial<Props> = {}) =>
  render({
    rows: [PRIYA_ROW, ALEX_ROW, SAM_ROW],
    birds: [GERALD, CRUMBS, KEVIN, PIP],
    ...over,
  });

const count = (html: string, text: string) => html.split(text).length - 1;

describe("ComposeView for several recipients", () => {
  it("shows a card, a picker and stats for each of three recipients", () => {
    const html = three();
    for (const name of ["Priya", "Alex", "Sam"]) {
      expect(html).toContain(`To ${name}`);
      expect(html).toMatch(
        new RegExp(`<h2[^>]*>Who's flying to ${name}\\?</h2>`),
      );
    }
    expect(count(html, ">Arrival odds<")).toBe(3);
    for (const distance of ["81 mi", "215 mi", "136 mi"])
      expect(html).toContain(`>${distance}<`);
    expect(count(html, 'aria-pressed="true"')).toBe(3);
    expect(count(html, 'id="note"')).toBe(1);
    expect(buttonWith(html, "Release").body).toContain("Release 3 birds");
    expect(releaseButton(html)).not.toContain("disabled");
  });

  it("keeps each recipient's card, picker and stats together under the note", () => {
    const html = three();
    const order = [
      "New pigeon post",
      "Your note",
      "To Priya",
      "Who's flying to Priya?",
      ">81 mi<",
      "To Alex",
      "Who's flying to Alex?",
      ">215 mi<",
      "To Sam",
      "Who's flying to Sam?",
      ">136 mi<",
      "Release 3 birds",
    ].map((text) => html.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("names the bird a row's note is too long for and disables Release", () => {
    const html = three({
      rows: [
        PRIYA_ROW,
        { ...ALEX_ROW, pickedId: "b1", tooLong: true },
        SAM_ROW,
      ],
    });
    expect(html).toMatch(/<p role="alert"[^>]*>Too long for Gerald\.<\/p>/);
    expect(count(html, "Too long for")).toBe(1);
    expect(releaseButton(html)).toContain("disabled");
  });

  it("disables Release while any row has no bird", () => {
    const html = three({
      rows: [PRIYA_ROW, ALEX_ROW, { ...SAM_ROW, pickedId: null }],
    });
    expect(releaseButton(html)).toContain("disabled");
  });

  it("warns under the row whose bird is hungry", () => {
    const html = three();
    const hungry = html.indexOf("Hungry. Can fly, but the odds drop.");
    expect(count(html, "Hungry. Can fly, but the odds drop.")).toBe(1);
    expect(hungry).toBeGreaterThan(html.indexOf("To Alex"));
    expect(hungry).toBeLessThan(html.indexOf("To Sam"));
  });

  it("passes the row's friend with a bird tap", () => {
    const onPick = vi.fn();
    const birds = elements(
      ComposeView(props({ rows: [PRIYA_ROW, ALEX_ROW], onPick })),
    ).filter((e) => e.props["aria-pressed"] !== undefined);
    expect(birds).toHaveLength(6);
    birds[3].props.onClick?.();
    expect(onPick).toHaveBeenCalledExactlyOnceWith("u3", "b1");
  });
});

describe("NoRecipient", () => {
  it("shows the reason and a way back to the address book", () => {
    const html = renderToStaticMarkup(
      <NoRecipient message="That friend is not in your address book." />,
    );
    expect(html).toContain("New pigeon post");
    expect(html).toContain("That friend is not in your address book.");
    expect(html).toContain('href="/send"');
  });
});
