import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { Units } from "@/lib/format";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import { GoneHome, Landed } from "./Landed";
import type { LandedState } from "./landedModel";
import { Postmark } from "./Postmark";

const MINUTE = 60_000;
const created = Date.parse("2026-11-19T15:04:00Z");
const arrived = created + 112 * MINUTE;
const leaves = arrived + 30 * MINUTE;
const now = leaves - 30 * MINUTE;

const BODY =
  "Saturday works. Bring the bread. Dumpling ate half my sandwich on the way out, so this note may smell like tuna.";

const visit = (over: Partial<SyncVisit> = {}): SyncVisit => ({
  id: "v1",
  bird: {
    id: "b1",
    name: "Dumpling",
    breed: "city",
    look: "dumpling",
    pronoun: "they",
    speedMph: 42,
    gear: [],
  },
  owner: { id: "u1", name: "Priya", handle: "priya" },
  note: { id: "n1", body: BODY, createdAt: created },
  arrivedAt: arrived,
  leavesAt: leaves,
  status: "waiting",
  snackGiven: false,
  flight: { distanceMi: 81, durationMs: 112 * MINUTE, delayKind: "minor" },
  ...over,
});

const philly = { name: "Philadelphia", region: "PA" };

function render(
  over: Partial<SyncVisit> = {},
  opts: { state?: LandedState; snacking?: boolean; units?: Units } = {},
) {
  return renderToStaticMarkup(
    <Landed
      visit={visit(over)}
      state={opts.state ?? "waiting"}
      city={philly}
      nowMs={now}
      timeZone="America/New_York"
      units={opts.units ?? "mi"}
      animate={false}
      snacking={opts.snacking ?? false}
      onSnack={() => {}}
    />,
  );
}

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

const snackButton = (html: string) =>
  html.match(
    /<button[^>]*>(?:(?!<\/button>)[\s\S])*Give Dumpling a snack/,
  )?.[0];

const css = readFileSync(
  new URL("./Landed.module.css", import.meta.url),
  "utf8",
);

describe("Landed, waiting (ac-2)", () => {
  const html = render();
  const words = text(html);

  it("shows the header chip, heading and trip summary", () => {
    const back = html.match(/<a[^>]*aria-label="Back to the loft"[^>]*>/)?.[0];
    expect(back).toContain('href="/"');
    expect(words).toContain("On your windowsill");
    expect(html).toMatch(/<h1[^>]*>Dumpling has landed<\/h1>/);
    expect(words).toContain(
      "From Priya in Philadelphia. 81 miles in 1h 52m, with one snack stop nobody will discuss.",
    );
  });

  it("writes the trip distance in the user's units", () => {
    expect(text(render({}, { units: "km" }))).toContain(
      "From Priya in Philadelphia. 130 kilometres in 1h 52m",
    );
  });

  it("draws the bird on the sill with a label", () => {
    expect(html).toContain(
      'aria-label="Dumpling stands on your windowsill with a note tied to its leg."',
    );
  });

  it("shows the note card signed by the owner with a postmark", () => {
    expect(words).toContain("NOTE FROM PRIYA");
    expect(words).toContain(BODY);
    expect(words).toMatch(/ P\. /);
    expect(html).toContain(
      'aria-label="Postmark: Pigeon Post, Philadelphia, November 19"',
    );
    expect(words).toContain("NOV 19");
    expect(words).toContain("PHILA, PA");
  });

  it("offers the reply link, the snack button and the countdown", () => {
    expect(html).toMatch(
      /<a[^>]*href="\/sill\/v1\/reply"[^>]*>Send Dumpling home with a reply<\/a>/,
    );
    const button = snackButton(html);
    expect(button).toBeDefined();
    expect(button).not.toContain("disabled");
    expect(words).toContain(
      `Give Dumpling a snack first (${config.game.seeds.snackCost} seeds)`,
    );
    expect(words).toContain(
      "Pigeons only fly home, so replies ride back free. Dumpling leaves in 30 minutes with or without one.",
    );
  });

  it("hides the snack button once a snack was given", () => {
    const given = render({ snackGiven: true });
    expect(given).not.toContain("snack first");
    expect(given).toContain('href="/sill/v1/reply"');
  });

  it("disables the snack button while a snack is on its way", () => {
    expect(snackButton(render({}, { snacking: true }))).toContain("disabled");
  });

  it("plays the landing when asked to animate", () => {
    const animated = renderToStaticMarkup(
      <Landed
        visit={visit()}
        state="waiting"
        city={philly}
        nowMs={now}
        timeZone="America/New_York"
        units="mi"
        animate
        snacking={false}
        onSnack={() => {}}
      />,
    );
    expect(animated).toContain("coo-land-fly");
    expect(html).not.toContain("coo-land-fly");
  });
});

describe("Landed, gone (ac-1)", () => {
  const html = render({}, { state: "gone" });
  const words = text(html);

  it("replaces the buttons with the gone-home line and a Compose link", () => {
    expect(words).toContain(
      "Dumpling has gone home. Reply with one of your own birds.",
    );
    expect(html).toMatch(
      /<a[^>]*href="\/send\/write\?to=u1"[^>]*>Compose<\/a>/,
    );
    expect(html).not.toContain("/reply");
    expect(html).not.toContain("snack first");
    expect(html).not.toContain("<button");
    expect(words).not.toContain("leaves in");
  });

  it("still shows the note", () => {
    expect(words).toContain(BODY);
  });
});

describe("GoneHome", () => {
  it("links Compose to the owner", () => {
    const html = renderToStaticMarkup(
      <GoneHome birdName="Dumpling" ownerId="u1" />,
    );
    expect(text(html)).toContain(
      "Dumpling has gone home. Reply with one of your own birds.",
    );
    expect(html).toMatch(
      /<a[^>]*href="\/send\/write\?to=u1"[^>]*>Compose<\/a>/,
    );
  });

  it("falls back to choosing a recipient without an owner", () => {
    const html = renderToStaticMarkup(
      <GoneHome birdName="Dumpling" ownerId={null} />,
    );
    expect(html).toMatch(/<a[^>]*href="\/send"[^>]*>Compose<\/a>/);
  });
});

describe("Postmark", () => {
  it("omits the place line without a city", () => {
    const html = renderToStaticMarkup(
      <Postmark date="NOV 19" place={null} label="Postmark: Pigeon Post" />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Postmark: Pigeon Post"');
    expect(text(html)).toContain("PIGEON POST");
    expect(text(html)).toContain("NOV 19");
    expect(html.match(/<text/g)).toHaveLength(2);
  });
});

describe("Landed styles", () => {
  it("uses tokens, never raw colours", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("keeps tap targets at least 44px and respects reduced motion", () => {
    expect(css).toContain("var(--coo-touch)");
    expect(css).toContain("prefers-reduced-motion");
  });
});
