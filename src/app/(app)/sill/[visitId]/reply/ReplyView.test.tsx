import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { Doodle } from "@/lib/game/notes";
import type { ReplyModel } from "./replyModel";
import { ReplyView } from "./ReplyView";

type Props = ComponentProps<typeof ReplyView>;

const REPLY = "Bread is secured. Tell Dumpling the tuna was not for her.";

const DOODLE: Doodle = {
  v: 1,
  w: config.game.notes.doodle.width,
  h: config.game.notes.doodle.height,
  strokes: [
    {
      color: "ink",
      width: "marker",
      points: [
        [10, 10],
        [40, 30],
      ],
    },
  ],
};

const MODEL: ReplyModel = {
  title: "Reply to Priya",
  heading: "Dumpling flies home to Priya",
  route: "Philadelphia, 81 miles. About 1h 53m at her pace.",
  speed: "43 mph",
  wroteLabel: "Priya wrote",
  note: "Saturday works. Bring the bread.",
  limit: 140,
  wait: "She waits 28 more minutes, then heads home with or without a reply.",
  release: "Send Dumpling home",
  composeHref: "/send/write?to=u1",
  doodle: null,
};

const props = (over: Partial<Props> = {}): Props => ({
  backHref: "/sill/v1",
  model: MODEL,
  bird: { look: "dumpling", breed: "city", gear: [] },
  note: REPLY,
  doodle: null,
  counter: { label: "57 of 140 characters", over: false },
  sending: false,
  onNote: () => {},
  onDoodle: () => {},
  onSend: () => {},
  ...over,
});

const render = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(<ReplyView {...props(over)} />);

const releaseTag = (html: string) => {
  const at = html.indexOf("Send Dumpling home");
  const open = html.lastIndexOf("<button", at);
  return html.slice(open, html.indexOf(">", open));
};

describe("ReplyView (ac-1)", () => {
  it("shows the mock's copy", () => {
    const html = render();
    expect(html).toMatch(/<h1[^>]*>Reply to Priya<\/h1>/);
    for (const text of [
      "Dumpling flies home to Priya",
      "Philadelphia, 81 miles. About 1h 53m at her pace.",
      "Free ride",
      "43 mph",
      "Priya wrote",
      "Saturday works. Bring the bread.",
      "Your reply",
      `>${REPLY}</textarea>`,
      "57 of 140 characters",
      "Same leg, same rules",
      "She waits 28 more minutes, then heads home with or without a reply.",
      "Send Dumpling home",
      "Send one of my own birds instead",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("labels the back button and the reply field", () => {
    const html = render();
    const back = html.match(/<a [^>]*aria-label="Back to the note"[^>]*>/)?.[0];
    expect(back).toContain('href="/sill/v1"');
    expect(html).toMatch(/<label for="reply-note"[^>]*>Your reply<\/label>/);
    expect(html).toMatch(/<textarea[^>]*id="reply-note"/);
  });

  it("draws the visiting bird", () => {
    expect(render()).toContain("<svg");
  });

  it("opens Compose for the same friend", () => {
    expect(render()).toMatch(
      /<a [^>]*href="\/send\/write\?to=u1"[^>]*>Send one of my own birds instead<\/a>/,
    );
  });

  it.each([
    ["words only", {}],
    ["a doodle only", { note: "", doodle: DOODLE }],
    ["words and a doodle", { doodle: DOODLE }],
  ] as const)("enables release for %s", (_, over) => {
    expect(releaseTag(render(over))).not.toContain("disabled");
  });

  it.each([
    ["the reply is empty", { note: "" }],
    ["the reply is only spaces", { note: "   " }],
    [
      "the reply is over the limit",
      { counter: { label: "141 of 140 characters", over: true } },
    ],
    [
      "the reply is over the limit, even with a doodle",
      {
        doodle: DOODLE,
        counter: { label: "141 of 140 characters", over: true },
      },
    ],
    ["a reply is sending", { sending: true }],
  ] as const)("disables release when %s", (_, over) => {
    expect(releaseTag(render(over))).toContain("disabled");
  });

  it("puts a doodle pad on the reply paper, under the words", () => {
    const html = render();
    const paper = html.indexOf('id="reply-note"');
    const pad = html.indexOf('aria-label="Doodle pad"');
    expect(pad).toBeGreaterThan(paper);
    expect(pad).toBeLessThan(html.indexOf("Same leg, same rules"));
  });
});

describe("ReplyView incoming doodle (ac-2)", () => {
  const incoming = (html: string) =>
    html.match(/<svg role="img" aria-label="A doodle"/g) ?? [];

  it("shows the incoming doodle under the incoming text", () => {
    const html = render({ model: { ...MODEL, doodle: DOODLE } });
    expect(incoming(html)).toHaveLength(1);
    expect(html.indexOf('aria-label="A doodle"')).toBeGreaterThan(
      html.indexOf("Saturday works. Bring the bread."),
    );
    expect(html.indexOf('aria-label="A doodle"')).toBeLessThan(
      html.indexOf("Your reply"),
    );
  });

  it("shows no incoming doodle when the note has none", () => {
    expect(incoming(render())).toHaveLength(0);
  });

  it("shows a doodle-only incoming note without an empty text line", () => {
    const html = render({ model: { ...MODEL, note: "", doodle: DOODLE } });
    expect(incoming(html)).toHaveLength(1);
    expect(html).not.toMatch(/<p[^>]*><\/p>/);
  });
});
