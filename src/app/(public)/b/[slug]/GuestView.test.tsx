import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { GuestView as Guest } from "@/server/services/guestLinks/get";
import { GuestExpired } from "./GuestExpired";
import { GuestView, guestCopy } from "./GuestView";

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

function guestFlying(over: Partial<Guest> = {}): Guest {
  return {
    senderName: "Max",
    recipientName: "Maya",
    bird: { name: "Gerald", look: "gerald", gear: [], pronoun: "he" },
    flight: {
      status: "flying",
      releaseAt: calm.plan.segments[0].startMs,
      arriveAt: calm.plan.arriveAtMs,
      plan: calm.plan,
      input: calm.input,
      from: { ...calm.input.from, label: "Brooklyn" },
      to: { ...calm.input.to, label: "Philadelphia" },
      placeNames: {
        deciles: Array.from({ length: 11 }, (_, i) =>
          i < 5 ? "Edison" : "Trenton",
        ),
      },
    },
    ...over,
  };
}

const midway = (g: Guest) =>
  g.flight.releaseAt + (g.flight.arriveAt! - g.flight.releaseAt) * 0.62;

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const render = (g: Guest, nowMs = midway(g)) =>
  renderToStaticMarkup(
    <GuestView
      guest={g}
      token="k3Hq9ZtB2mXw7PaL"
      serverNow={nowMs}
      timeZone="America/New_York"
      member={false}
    />,
  );

describe("Guest page, sealed (Guest.png)", () => {
  it("says who sent the pigeon and who it is for", () => {
    const words = text(render(guestFlying()));
    expect(words).toContain("No app needed");
    expect(words).toContain("Max sent you a pigeon");
    expect(words).toMatch(
      /His name is Gerald\. He left Brooklyn at \d{1,2}:\d{2} [ap]m with a note for you, Maya\./,
    );
  });

  it("shows the live map, the progress and the time left", () => {
    const g = guestFlying();
    const html = render(g);
    expect(html).toContain('data-map="true"');
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="62"/);
    const words = text(html);
    expect(words).toContain("Over Trenton");
    const left = Math.round((g.flight.arriveAt! - midway(g)) / 60_000);
    expect(words).toContain(`Lands in ${left} min`);
  });

  it("keeps the note sealed and out of the page", () => {
    const words = text(render(guestFlying()));
    expect(words).toContain("Your note is sealed");
    expect(words).toContain(
      "It opens the moment Gerald lands. He takes this seriously.",
    );
  });

  it("offers the landing text, the explainer and Report", () => {
    const html = render(guestFlying());
    expect(html).toMatch(/<button[^>]*>Text me when he lands<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/welcome"[^>]*>What is this\?<\/a>/);
    expect(html).toMatch(/<button[^>]*>Report this link<\/button>/);
  });

  it("links to privacy and terms", () => {
    const html = render(guestFlying());
    expect(html).toMatch(/<a[^>]*href="\/privacy"[^>]*>Privacy<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/terms"[^>]*>Terms<\/a>/);
  });

  it("names the bird when the flight has not taken off yet", () => {
    const g = guestFlying({
      flight: { ...guestFlying().flight, status: "scheduled", plan: undefined },
    });
    const words = text(render(g, g.flight.releaseAt - 60_000));
    expect(words).toContain("Waiting in Brooklyn");
    expect(words).toContain("Your note is sealed");
  });
});

describe("guestCopy", () => {
  it("matches the mock's sentences", () => {
    const c = guestCopy(guestFlying(), "America/New_York");
    expect(c.title).toBe("Max sent you a pigeon");
    expect(c.notify).toBe("Text me when he lands");
    expect(c.consent).toBe("Send me one text when Gerald lands.");
  });

  it("uses plural verbs for a bird who goes by they", () => {
    const g = guestFlying();
    const c = guestCopy(
      { ...g, bird: { ...g.bird, pronoun: "they" } },
      "America/New_York",
    );
    expect(c.notify).toBe("Text me when they land");
    expect(c.sealed).toBe(
      "It opens the moment Gerald lands. They take this seriously.",
    );
  });
});

describe("Guest page, expired and missing", () => {
  it("says an expired link has expired", () => {
    const words = text(renderToStaticMarkup(<GuestExpired kind="expired" />));
    expect(words).toContain("This link has expired");
    expect(words).toContain("What is this?");
  });

  it("shows a missing link the same way whatever the cause", () => {
    const words = text(renderToStaticMarkup(<GuestExpired kind="missing" />));
    expect(words).toContain("No bird is flying on that link");
    expect(words).not.toContain("expired");
  });
});

describe("Guest page styling", () => {
  it("uses tokens only, with 44 px tap targets", () => {
    for (const file of [
      "./GuestView.tsx",
      "./GuestExpired.tsx",
      "./GuestNotify.tsx",
      "./GuestReport.tsx",
      "./Guest.module.css",
    ]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toMatch(
        /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
      );
    }
    expect(
      readFileSync(new URL("./Guest.module.css", import.meta.url), "utf8"),
    ).toMatch(/min-height: var\(--coo-touch\)/);
  });
});

describe("Guest page, sealed card layout", () => {
  const css = readFileSync(
    new URL("./Guest.module.css", import.meta.url),
    "utf8",
  );
  const declsOf = (name: string) => {
    const decls: Record<string, string> = {};
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!selectors.split(",").some((s) => s.trim() === `.${name}`)) continue;
      for (const [, prop, value] of body.matchAll(/([\w-]+):\s*([^;]+);/g)) {
        decls[prop] = value.trim();
      }
    }
    return decls;
  };

  it("lays the sealed note out as a bordered card, envelope beside the words", () => {
    const sealed = declsOf("sealed");
    expect(sealed.display).toBe("flex");
    expect(sealed["align-items"]).toBe("center");
    expect(sealed.background).toBe("var(--coo-card)");
    expect(sealed.border).toBe("var(--coo-line)");
    expect(sealed["border-radius"]).toBe("var(--coo-radius-row)");
    expect(sealed.width).toBeUndefined();
    expect(declsOf("envelope").width).toBe("92px");
  });
});

describe("Guest page never hints at a doodle before landing (#678 ac-2)", () => {
  it("keeps the sealed envelope with no doodle while the bird flies", () => {
    const html = render(guestFlying());
    expect(html).toContain("Your note is sealed");
    expect(html.toLowerCase()).not.toContain("doodle");
  });

  it("shows no doodle on an expired, missing or reported link", () => {
    for (const kind of ["expired", "missing", "reported"] as const) {
      const html = renderToStaticMarkup(<GuestExpired kind={kind} />);
      expect(html.toLowerCase(), kind).not.toContain("doodle");
    }
  });
});
