import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Units } from "@/lib/format";
import type { ShoeboxNote } from "@/server/services/notes";
import { NoteCard } from "./NoteCard";

const MINUTE = 60_000;
const created = Date.parse("2026-11-19T15:04:00Z");

const note = (over: Partial<ShoeboxNote> = {}): ShoeboxNote => ({
  id: "n1",
  direction: "received",
  state: "delivered",
  body: "Saturday works. Bring the bread.",
  doodle: null,
  with: { id: "u2", name: "Priya", handle: "priya" },
  bird: { id: "b1", name: "Dumpling", look: "dumpling" },
  trip: { distanceMi: 81, durationMs: 112 * MINUTE },
  createdAt: created,
  deliveredAt: created + 112 * MINUTE,
  ...over,
});

const render = (
  over: Partial<ShoeboxNote> = {},
  index = 0,
  units: Units = "mi",
) =>
  renderToStaticMarkup(
    <NoteCard
      note={note(over)}
      index={index}
      timeZone="America/New_York"
      units={units}
    />,
  );

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("NoteCard (ac-1)", () => {
  it("heads a received note FROM the sender and a sent note TO the recipient", () => {
    expect(text(render())).toContain("FROM PRIYA");
    expect(text(render({ direction: "sent" }))).toContain("TO PRIYA");
  });

  it("writes the body in the hand font", () => {
    const html = render();
    expect(html).toMatch(
      /<p class="[^"]*body[^"]*">Saturday works\. Bring the bread\.<\/p>/,
    );
    const css = readFileSync(
      new URL("./NoteCard.module.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(/\.body \{[^}]*font-family: var\(--coo-font-hand\)/);
  });

  it("draws the bird avatar and the trip line", () => {
    const html = render();
    expect(html).toContain("<svg");
    expect(text(html)).toContain("Dumpling, 81 mi in 1h 52m");
  });

  it("counts a short trip in blocks and seconds", () => {
    const words = text(
      render({
        bird: { id: "b2", name: "Biscuit", look: "brenda" },
        trip: { distanceMi: 0.15, durationMs: 31_000 },
      }),
    );
    expect(words).toContain("Biscuit, 3 blocks in 31 seconds");
  });

  it("writes the trip distance in the user's units", () => {
    expect(text(render({}, 0, "km"))).toContain("Dumpling, 130 km in 1h 52m");
    const short = text(
      render({ trip: { distanceMi: 0.15, durationMs: 31_000 } }, 0, "km"),
    );
    expect(short).toContain("Dumpling, 250 metres in 31 seconds");
  });

  it("stamps the dated postmark", () => {
    const html = render();
    expect(html).toContain('aria-label="Postmark: Pigeon Post, November 19"');
    expect(text(html)).toContain("NOV 19");
  });

  it("alternates the tilt from one card to the next", () => {
    const tilt = (i: number) =>
      render({}, i).match(/rotate\((-?[\d.]+)deg\)/)?.[1];
    expect(Number(tilt(0))).toBeGreaterThan(0);
    expect(Number(tilt(1))).toBeLessThan(0);
    expect(Number(tilt(2))).toBeGreaterThan(0);
  });

  it("shows an unlanded sent note as In the air", () => {
    const words = text(
      render({ direction: "sent", state: "in_the_air", deliveredAt: null }),
    );
    expect(words).toContain("In the air");
    expect(words).not.toContain("81 mi");
  });

  it("shows a returned note as Came back home", () => {
    expect(text(render({ direction: "sent", state: "returned" }))).toContain(
      "Came back home",
    );
  });

  it("reads FROM A FORMER FRIEND for a deleted account", () => {
    const words = text(
      render({ with: { id: null, name: "a former friend", handle: null } }),
    );
    expect(words).toContain("FROM A FORMER FRIEND");
  });

  it("leaves out the bird row when no bird carried the note", () => {
    const words = text(render({ bird: null, trip: null }));
    expect(words).not.toContain("Dumpling");
  });
});
