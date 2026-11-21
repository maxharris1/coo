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
import { ComposeView, NoRecipient } from "./ComposeView";

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
};

const STATS = {
  distance: "81 mi",
  flightTime: "1h 48m",
  odds: "94%",
  forecast: "Lands around 11:20 am. Clear skies over Jersey.",
};

const props = (over: Partial<Props> = {}): Props => ({
  recipient: {
    name: "Priya",
    line: "Philadelphia, 81 miles as the pigeon flies",
  },
  note: NOTE,
  counter: { text: "79 of 140 characters", over: false },
  birds: [GERALD, CRUMBS, KEVIN],
  pickedId: "b1",
  stats: STATS,
  forecastHref: "/send/forecast?to=u2",
  sending: false,
  onNote: () => {},
  onPick: () => {},
  onRelease: () => {},
  ...over,
});

const render = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(<ComposeView {...props(over)} />).replaceAll(
    "&#x27;",
    "'",
  );

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
    ["no bird is ready", { pickedId: null }],
  ] as const)("disables Release when %s", (_, over) => {
    expect(releaseButton(render(over))).toContain("disabled");
  });

  it("says nobody is rested when no bird is ready", () => {
    const html = render({ pickedId: null });
    expect(html).toContain(noRested);
    expect(html).not.toContain("Release Gerald");
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
    const html = render({ pickedId: "b2" });
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

  it("keeps ready and hungry birds pickable", () => {
    const html = render();
    expect(buttonWith(html, "Gerald").tag).not.toContain("disabled");
    expect(buttonWith(html, "Adm. Crumbs").tag).not.toContain("disabled");
  });

  it("warns when the picked bird is hungry", () => {
    expect(render({ pickedId: "b2" })).toContain(
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
    const html = render({ stats: null });
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
  children?: ReactNode;
  onChange?: (e: { target: { value: string } }) => void;
  onClick?: () => void;
};

const elements = (node: ReactNode): ReactElement<Handlers>[] => {
  if (!isValidElement<Handlers>(node)) return [];
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
    expect(onPick).toHaveBeenCalledExactlyOnceWith("b2");
  });

  it("passes the Release tap to onRelease", () => {
    const onRelease = vi.fn();
    const button = elements(ComposeView(props({ onRelease }))).find(
      (e) => e.props.className?.includes("release"),
    );
    button?.props.onClick?.();
    expect(onRelease).toHaveBeenCalledOnce();
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
