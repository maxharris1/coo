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
import { ComposeView, NoRecipient } from "./ComposeView";

type Props = ComponentProps<typeof ComposeView>;

const NOTE =
  "Dinner Saturday? I'll bring the good bread. Do NOT tell Gerald about the bread.";

const props = (over: Partial<Props> = {}): Props => ({
  recipient: {
    name: "Priya",
    line: "Philadelphia, 81 miles as the pigeon flies",
  },
  note: NOTE,
  counter: { text: "79 of 140 characters", over: false },
  birdName: "Gerald",
  sending: false,
  onNote: () => {},
  onRelease: () => {},
  ...over,
});

const render = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(<ComposeView {...props(over)} />).replaceAll(
    "&#x27;",
    "'",
  );

const releaseButton = (html: string) => {
  const button = html
    .split("<button")
    .find((chunk) => chunk.includes("Release"));
  if (!button) throw new Error("no Release button");
  return button.slice(0, button.indexOf(">"));
};

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
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toContain('href="/send"');
    expect(html).toContain(">Change</a>");
  });

  it("labels the note field", () => {
    const html = render();
    expect(html).toMatch(/<label for="note"[^>]*>Your note<\/label>/);
    expect(html).toMatch(/<textarea[^>]*id="note"/);
  });

  it("does not build the bird picker or the stats yet", () => {
    const html = render();
    expect(html).not.toContain("Who's flying?");
    expect(html).not.toContain("Arrival odds");
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
    ["no bird is ready", { birdName: null }],
  ] as const)("disables Release when %s", (_, over) => {
    expect(releaseButton(render(over))).toContain("disabled");
  });

  it("says nobody is rested when no bird is ready", () => {
    const html = render({ birdName: null });
    expect(html).toContain(noRested);
    expect(html).not.toContain("Release Gerald");
  });
});

type Handlers = {
  type?: string;
  disabled?: boolean;
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

  it("passes the Release tap to onRelease", () => {
    const onRelease = vi.fn();
    const button = elements(ComposeView(props({ onRelease }))).find(
      (e) => e.type === "button",
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
