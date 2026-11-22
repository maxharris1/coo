import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DELAY,
  delayedFlight,
  DURING,
  PLAN,
} from "@/test/fixtures/delayedFlight";
import { TrackerDelay } from "./TrackerDelay";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("TrackerDelay", () => {
  it("tells the owner during a major delay and links to the incident report", () => {
    const flight = delayedFlight();
    const html = renderToStaticMarkup(
      <TrackerDelay flight={flight} nowMs={DURING} />,
    );
    expect(html).toContain(`href="/flights/${flight.id}/incident"`);
    expect(text(html)).toBe("Kevin is running late. Read the incident report.");
  });

  it.each([
    [
      "for a minor delay",
      delayedFlight({ plan: { ...PLAN, delayKind: "minor" } }),
      DURING,
    ],
    ["before the delay", delayedFlight(), DELAY.startMs - 1],
    ["once the delay is over", delayedFlight(), DELAY.endMs],
    ["for a bird flying to me", delayedFlight({ role: "incoming" }), DURING],
    [
      "for a flight with no plan yet",
      delayedFlight({ plan: undefined }),
      DURING,
    ],
  ])("shows nothing %s", (_, flight, nowMs) => {
    expect(
      renderToStaticMarkup(<TrackerDelay flight={flight} nowMs={nowMs} />),
    ).toBe("");
  });
});
