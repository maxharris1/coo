import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ForecastModel } from "./forecast";
import { ForecastView } from "./ForecastView";

type Props = ComponentProps<typeof ForecastView>;

const at = (hour: number) => Date.UTC(2026, 10, 20, hour + 5);

const MOCK: ForecastModel = {
  route: "Brooklyn to Philadelphia, Friday",
  question: "When should Gerald leave?",
  chips: [
    { at: at(7), label: "7 am", odds: "94%", roosts: false, selected: false },
    { at: at(9), label: "9 am", odds: "92%", roosts: false, selected: false },
    { at: at(11), label: "11 am", odds: "88%", roosts: false, selected: false },
    { at: at(13), label: "1 pm", odds: "81%", roosts: false, selected: true },
    { at: at(15), label: "3 pm", odds: "81%", roosts: true, selected: false },
  ],
  selected: {
    odds: "81%",
    heading: "Arrival odds leaving at 1:00 pm",
    detail: "About 2h 06m. Lands near 3:06 pm.",
  },
  factors: [
    {
      kind: "headwind",
      title: "Headwind",
      text: "14 mph from the southwest",
      effect: "+18 min",
    },
    {
      kind: "rain",
      title: "Rain over Trenton",
      text: "Light, starting around 1 pm",
      effect: "6% off",
    },
    {
      kind: "hawk",
      title: "Hawk advisory",
      text: "Peregrine spotted near Princeton",
      effect: "4% off",
    },
    {
      kind: "fair",
      title: "Street fair in Hoboken",
      text: "Funnel cake. High distraction risk.",
      effect: "3% off",
    },
  ],
  sunset:
    "Sunset is 4:34 pm. Birds still out at dusk roost for the night and finish the trip at sunrise.",
  best: { at: at(7), label: "Schedule for 7 am instead" },
  send: { label: "Send at 1 pm anyway", releaseAt: at(13) },
};

const props = (over: Partial<Props> = {}): Props => ({
  model: MOCK,
  backHref: "/send/write?to=f1",
  sending: false,
  onPick: () => {},
  onSchedule: () => {},
  onSend: () => {},
  ...over,
});

const render = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(<ForecastView {...props(over)} />);

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const chipFor = (html: string, label: string) =>
  html
    .split("<button")
    .find((chunk) => chunk.includes(`>${label}<`))!
    .split("</button>")[0];

describe("ForecastView", () => {
  it("draws every line of the mock, in order", () => {
    const lines = [
      "Flight forecast",
      "Brooklyn to Philadelphia, Friday",
      "When should Gerald leave?",
      "7 am 94%",
      "9 am 92%",
      "11 am 88%",
      "1 pm 81%",
      "3 pm Roosts",
      "81% Arrival odds leaving at 1:00 pm About 2h 06m. Lands near 3:06 pm.",
      "Along the route",
      "Headwind 14 mph from the southwest +18 min",
      "Rain over Trenton Light, starting around 1 pm 6% off",
      "Hawk advisory Peregrine spotted near Princeton 4% off",
      "Street fair in Hoboken Funnel cake. High distraction risk. 3% off",
      "Sunset is 4:34 pm. Birds still out at dusk roost for the night and finish the trip at sunrise.",
      "Schedule for 7 am instead",
      "Send at 1 pm anyway",
    ];
    const page = text(render());
    let from = 0;
    for (const line of lines) {
      const found = page.indexOf(line, from);
      expect(found, line).toBeGreaterThanOrEqual(from);
      from = found + line.length;
    }
  });

  it("goes back to the note with a labelled control", () => {
    expect(render()).toMatch(
      /<a aria-label="Back to your note" class="_back_[^"]*" href="\/send\/write\?to=f1">/,
    );
  });

  it("presses only the selected hour", () => {
    const html = render();
    expect(chipFor(html, "1 pm")).toContain('aria-pressed="true"');
    for (const label of ["7 am", "9 am", "11 am", "3 pm"])
      expect(chipFor(html, label)).toContain('aria-pressed="false"');
  });

  it("tints good odds mint, the rest sun, and a roosting hour lilac", () => {
    const html = render();
    expect(chipFor(html, "7 am")).toContain("_good_");
    expect(chipFor(html, "9 am")).toContain("_good_");
    expect(chipFor(html, "11 am")).toContain("_fair_");
    expect(chipFor(html, "1 pm")).toContain("_fair_");
    expect(chipFor(html, "3 pm")).toContain("_roosts_");
  });

  it("gives each factor the icon for its kind", () => {
    const html = render();
    for (const icon of ["wind", "rain", "hawk", "tent"])
      expect(html).toContain(`/assets/svg/icons/${icon}.svg`);
  });

  it("draws a rain cloud when rain is along the route, and sun otherwise", () => {
    expect(render()).toContain('aria-label="Rain cloud"');
    const dry = render({
      model: {
        ...MOCK,
        factors: MOCK.factors.filter((f) => f.kind !== "rain"),
      },
    });
    expect(dry).not.toContain('aria-label="Rain cloud"');
    expect(dry).toContain('aria-label="Clear skies"');
  });

  it("hands the chosen hour to its callbacks", () => {
    const picked: number[] = [];
    const scheduled: number[] = [];
    const sent: (number | undefined)[] = [];
    const tree = ForecastView(
      props({
        onPick: (a) => picked.push(a),
        onSchedule: (a) => scheduled.push(a),
        onSend: (a) => sent.push(a),
      }),
    );
    const buttons = collect(tree);
    buttons.find((b) => b.label === "9 am")!.onClick();
    buttons.find((b) => b.label === "Schedule for 7 am instead")!.onClick();
    buttons.find((b) => b.label === "Send at 1 pm anyway")!.onClick();
    expect(picked).toEqual([at(9)]);
    expect(scheduled).toEqual([at(7)]);
    expect(sent).toEqual([at(13)]);
  });

  it("sends now with no release time when the selected hour is under way", () => {
    const sent: (number | undefined)[] = ["unset" as never];
    const tree = ForecastView(
      props({
        model: { ...MOCK, send: { label: "Send now", releaseAt: undefined } },
        onSend: (a) => (sent[0] = a),
      }),
    );
    collect(tree)
      .find((b) => b.label === "Send now")!
      .onClick();
    expect(sent).toEqual([undefined]);
  });

  it("disables both buttons while a send is in flight", () => {
    const html = render({ sending: true });
    const disabled = html.match(/<button[^>]*disabled=""[^>]*>/g) ?? [];
    expect(disabled).toHaveLength(2);
  });

  it("makes the send button the main one when every hour roosts", () => {
    const html = render({
      model: {
        ...MOCK,
        best: null,
        send: { label: "Send at 3 pm", releaseAt: at(15) },
      },
    });
    expect(html).not.toContain("Schedule for");
    expect(html).toMatch(/class="_primary_[^"]*"[^>]*>Send at 3 pm</);
  });
});

type Clickable = { label: string; onClick: () => void };

function collect(node: unknown): Clickable[] {
  if (Array.isArray(node)) return node.flatMap(collect);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const { props: p } = node as {
    props: { onClick?: () => void; children?: unknown };
  };
  const own: Clickable[] = p.onClick
    ? [{ label: firstText(p.children), onClick: p.onClick }]
    : [];
  return [...own, ...collect(p.children)];
}

function firstText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(firstText).find(Boolean) ?? "";
  if (node && typeof node === "object" && "props" in node)
    return firstText(
      (node as { props: { children?: unknown } }).props.children,
    );
  return "";
}
