import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReplyModel } from "./replyModel";
import { ReplyView } from "./ReplyView";

type Props = ComponentProps<typeof ReplyView>;

const REPLY = "Bread is secured. Tell Dumpling the tuna was not for her.";

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
};

const props = (over: Partial<Props> = {}): Props => ({
  backHref: "/sill/v1",
  model: MODEL,
  bird: { look: "dumpling", breed: "city", gear: [] },
  note: REPLY,
  counter: { label: "57 of 140 characters", over: false },
  sending: false,
  onNote: () => {},
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

  it("enables release for a reply that fits", () => {
    expect(releaseTag(render())).not.toContain("disabled");
  });

  it.each([
    ["the reply is empty", { note: "" }],
    ["the reply is only spaces", { note: "   " }],
    [
      "the reply is over the limit",
      { counter: { label: "141 of 140 characters", over: true } },
    ],
    ["a reply is sending", { sending: true }],
  ] as const)("disables release when %s", (_, over) => {
    expect(releaseTag(render(over))).toContain("disabled");
  });
});
