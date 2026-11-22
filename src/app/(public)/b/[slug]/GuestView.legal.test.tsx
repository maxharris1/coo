import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { GuestView as Guest } from "@/server/services/guestLinks/get";
import type { GuestShown } from "./useGuestPage";
import { GuestView } from "./GuestView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

vi.mock("@/components/MapView", () => ({
  MapView: () => <div data-map="true" />,
}));

const page = vi.hoisted(() => ({ shown: null as GuestShown | null }));

vi.mock("./useGuestPage", () => ({
  useGuestPage: (guest: Guest, _token: string, serverNow: number) => ({
    shown: page.shown ?? { kind: "live", guest },
    clock: { nowMs: serverNow, offsetMs: 0 },
    reported: () => {},
  }),
}));

type Vector = { name: string; input: FlightInput; plan: FlightPlan };

const calm: Vector = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors[0];

function guest(
  over: Partial<Guest["flight"]> = {},
  note?: Guest["note"],
): Guest {
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
      placeNames: { deciles: [] },
      ...over,
    },
    note,
  };
}

const flying = guest();
const landedWithNote = guest(
  { status: "landed" },
  { body: "Dinner Saturday?", doodle: null, createdAt: calm.plan.segments[0].startMs },
);

function hrefs(g: Guest, shown: GuestShown | null): string[] {
  page.shown = shown;
  const html = renderToStaticMarkup(
    <GuestView
      guest={g}
      token="k3Hq9ZtB2mXw7PaL"
      serverNow={calm.plan.arriveAtMs + 60_000}
      timeZone="America/New_York"
      member={false}
    />,
  );
  return [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(([, href]) => href);
}

describe("Guest page links to privacy and terms in every state", () => {
  it.each([
    ["sealed", flying, null],
    ["landed with the note", landedWithNote, null],
    ["expired", flying, { kind: "expired" }],
    ["missing", flying, { kind: "missing" }],
    ["reported", flying, { kind: "reported" }],
  ] as const)("%s", (_state, g, shown) => {
    const links = hrefs(g, shown);
    expect(links).toContain("/privacy");
    expect(links).toContain("/terms");
    expect(links.filter((h) => h === "/privacy")).toHaveLength(1);
  });
});
