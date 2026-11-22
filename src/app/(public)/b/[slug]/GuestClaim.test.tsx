import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { GuestView as Guest } from "@/server/services/guestLinks/get";
import {
  GuestClaim,
  checkClaim,
  claimCopy,
  type LandedGuest,
} from "./GuestClaim";
import { GuestView } from "./GuestView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

vi.mock("@/components/MapView", () => ({
  MapView: () => <div data-map="true" />,
}));

type Vector = { name: string; input: FlightInput; plan: FlightPlan };

const calm: Vector = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors[0];

const BODY =
  "Dinner Saturday? I'll bring the good bread. Do NOT tell Gerald about the bread.";
const MINUTE = 60_000;
const { waitMinutes } = config.game.visits;

function guestLanded(over: Partial<Guest> = {}): LandedGuest {
  return {
    senderName: "Max",
    recipientName: "Maya",
    bird: { name: "Gerald", look: "gerald", gear: [], pronoun: "he" },
    flight: {
      status: "landed",
      releaseAt: calm.plan.segments[0].startMs,
      arriveAt: calm.plan.arriveAtMs,
      plan: calm.plan,
      input: calm.input,
      from: { ...calm.input.from, label: "Brooklyn" },
      to: { ...calm.input.to, label: "Philadelphia" },
      placeNames: { deciles: [] },
    },
    note: { body: BODY, createdAt: calm.plan.segments[0].startMs },
    ...over,
  };
}

function headwindInput(g: Guest): FlightInput["weather"] {
  const [a, b, c] = g.flight.input!.weather.map((s) => ({
    ...s,
    windMph: config.game.weather.windyMph,
    windFromDeg: g.flight.plan!.bearingDeg,
  }));
  return [a, b, c];
}

const justLanded = (g: Guest) => g.flight.arriveAt! + MINUTE;

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const render = (g: LandedGuest, nowMs = justLanded(g)) =>
  renderToStaticMarkup(
    <GuestClaim
      guest={g}
      token="k3Hq9ZtB2mXw7PaL"
      nowMs={nowMs}
      timeZone="America/New_York"
      onReported={() => {}}
    />,
  );

describe("Guest page, landed (GuestClaim.png)", () => {
  it("says the bird made it, how far and how long", () => {
    const words = text(render(guestLanded()));
    expect(words).toContain("He made it");
    expect(words).toContain("82 miles in 1h 49m.");
    expect(words).not.toContain("headwind");
  });

  it("mentions the headwind when the bird flew into one", () => {
    const g = guestLanded();
    const windy = {
      ...g,
      flight: {
        ...g.flight,
        input: { ...g.flight.input!, weather: headwindInput(g) },
      },
    };
    expect(text(render(windy))).toContain(
      "He would like you to know about the headwind.",
    );
  });

  it("shows the bird on the sill and the note with its postmark", () => {
    const html = render(guestLanded());
    expect(html).toContain('aria-label="Gerald on your sill with the note"');
    expect(html).toContain('aria-label="Postmark: Pigeon Post, Brooklyn, ');
    const words = text(html);
    expect(words).toContain("NOTE FROM MAX");
    expect(words).toContain(BODY);
    expect(words).toContain("BROOKLYN");
  });

  it("offers the claim form from the mock", () => {
    const html = render(guestLanded());
    const words = text(html);
    expect(words).toContain("Send Gerald home with a reply");
    expect(words).toContain(
      "Make a free loft. You get a bird of your own, and Gerald carries your answer back to Max.",
    );
    expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Your name<\/label>/);
    expect(html).toMatch(
      /<label[^>]*for="[^"]+"[^>]*>Phone number, for landing texts<\/label>/,
    );
    expect(html).toMatch(
      /<input[^>]*type="tel"[^>]*placeholder="\(555\) 010-0199"/,
    );
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*>Make my loft<\/button>/,
    );
  });

  it("counts down the bird's wait on the sill", () => {
    const g = guestLanded();
    expect(text(render(g, g.flight.arriveAt!))).toContain(
      `Gerald waits on your sill for ${waitMinutes} minutes, then heads home.`,
    );
    expect(text(render(g, g.flight.arriveAt! + 20 * MINUTE))).toContain(
      `Gerald waits on your sill for ${waitMinutes - 20} minutes, then heads home.`,
    );
  });

  it("says the bird has gone home once the wait is over", () => {
    const g = guestLanded();
    const words = text(render(g, g.flight.arriveAt! + waitMinutes * MINUTE));
    expect(words).toContain("Gerald has gone home.");
    expect(words).not.toContain("Send Gerald home");
    expect(words).toContain("Make my loft");
  });

  it("uses the bird's pronoun and plural verbs for they", () => {
    const g = guestLanded();
    const they = {
      ...g,
      bird: { ...g.bird, pronoun: "they" as const },
      flight: {
        ...g.flight,
        input: { ...g.flight.input!, weather: headwindInput(g) },
      },
    };
    const c = claimCopy(they, justLanded(g));
    expect(c.title).toBe("They made it");
    expect(c.summary).toBe(
      "82 miles in 1h 49m. They would like you to know about the headwind.",
    );
  });
});

describe("GuestView", () => {
  it("opens the claim state once the note has landed", () => {
    const g = guestLanded();
    const html = renderToStaticMarkup(
      <GuestView
        guest={g}
        token="k3Hq9ZtB2mXw7PaL"
        serverNow={justLanded(g)}
        timeZone="America/New_York"
      />,
    );
    const words = text(html);
    expect(words).toContain("He made it");
    expect(words).toContain(BODY);
    expect(words).toContain("Make my loft");
    expect(words).not.toContain("Your note is sealed");
    expect(html).not.toContain('data-map="true"');
  });

  it("keeps the Report link once the note is readable", () => {
    const g = guestLanded();
    const html = renderToStaticMarkup(
      <GuestView
        guest={g}
        token="k3Hq9ZtB2mXw7PaL"
        serverNow={justLanded(g)}
        timeZone="America/New_York"
      />,
    );
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*>Report this link<\/button>/,
    );
  });
});

describe("checkClaim", () => {
  it("asks for a name before anything else", () => {
    expect(checkClaim("  ", "(555) 010-0199", "Gerald")).toEqual({
      ok: false,
      error: "What should Gerald call you?",
      field: "name",
    });
  });

  it("refuses a number that is not a phone number", () => {
    expect(checkClaim("Maya", "12", "Gerald")).toEqual({
      ok: false,
      error: "That doesn't look like a phone number.",
      field: "phone",
    });
  });

  it("accepts a name and a number", () => {
    expect(checkClaim(" Maya ", "(555) 010-0199", "Gerald")).toEqual({
      ok: true,
      name: "Maya",
      phone: "+15550100199",
    });
  });
});

describe("GuestClaim styling", () => {
  it("uses tokens only, with 44 px tap targets", () => {
    for (const file of ["./GuestClaim.tsx", "./GuestClaim.module.css"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toMatch(
        /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
      );
    }
    expect(
      readFileSync(new URL("./GuestClaim.module.css", import.meta.url), "utf8"),
    ).toMatch(/min-height: var\(--coo-touch\)/);
  });
});
