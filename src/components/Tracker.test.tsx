import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { Flight } from "@/server/services/flights/shape";
import { Tracker, trackerView } from "./Tracker";

const TZ = "America/New_York";

type Vector = { name: string; input: FlightInput; plan: FlightPlan };

const vectors: Vector[] = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors;

function flightFrom(name: string, over: Partial<Flight> = {}): Flight {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`no vector ${name}`);
  return {
    id: v.input.flightId,
    kind: "delivery",
    status: "flying",
    bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
    owner: { id: "u1", name: "Max", handle: "max" },
    counterpart: { id: "u2", name: "Priya", handle: "priya" },
    from: { ...v.input.from, label: "Brooklyn" },
    to: { ...v.input.to, label: "Philly" },
    releaseAt: v.plan.segments[0].startMs,
    arriveAt: v.plan.arriveAtMs,
    distanceMi: v.plan.distanceMi,
    plan: v.plan,
    input: v.input,
    placeNames: {},
    role: "mine",
    hasNote: true,
    ...over,
  };
}

function at(flight: Flight, frac: number): number {
  return flight.releaseAt + (flight.arriveAt! - flight.releaseAt) * frac;
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function statsOf(flight: Flight): string {
  const view = trackerView(flight, Date.now(), TZ, "mi");
  return view.stats.map((s) => `${s.value} ${s.label}`).join(" ");
}

describe("Tracker at 50% of the calm vector (ac-1)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows about half the miles and a time of day to land", () => {
    const flight = flightFrom("calm-short");
    vi.setSystemTime(at(flight, 0.5));
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} units="mi" />,
      ),
    );
    expect(page).toContain("In the air");
    expect(page).toContain("Gerald is on the way to Priya");
    expect(page).toContain("Carrying your note to Priya");
    expect(page).toContain("41 of 82 mi");
    expect(page).toContain("around midday Lands");
    expect(page).not.toContain("Lands in");
    expect(page).not.toContain("55 min");
    expect(statsOf(flight)).not.toMatch(/\d{1,2}:\d{2}\s?(am|pm)/i);
    expect(page).toContain("45 mph Speed");
    expect(page).toMatch(/(Rooftop|Lowish|Quite high) Altitude/);
  });

  it("applies the server clock offset", () => {
    const flight = flightFrom("calm-short");
    vi.setSystemTime(at(flight, 0.5) - 10 * 60_000);
    const page = text(
      renderToStaticMarkup(
        <Tracker
          flight={flight}
          offsetMs={10 * 60_000}
          timeZone={TZ}
          units="mi"
        />,
      ),
    );
    expect(page).toContain("41 of 82 mi");
    expect(page).toContain("around midday Lands");
  });

  it("reads 'Carrying a note for you' on an incoming flight", () => {
    const flight = flightFrom("calm-short", { role: "incoming" });
    vi.setSystemTime(at(flight, 0.5));
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} units="mi" />,
      ),
    );
    expect(page).toContain("Carrying a note for you");
  });
});

describe("Tracker on the block vector (ac-3)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("says any minute now at 50% with decimal miles", () => {
    const flight = flightFrom("block");
    vi.setSystemTime(at(flight, 0.5));
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} units="mi" />,
      ),
    );
    expect(page).toContain("any minute now Lands");
    expect(page).toContain("1.1 of 2.2 mi");
    expect(page).not.toMatch(/\d+ min|\d+ sec/);
  });

  it("says any minute now 14 s before landing, with no seconds countdown", () => {
    const flight = flightFrom("block");
    vi.setSystemTime(flight.arriveAt! - 14_000);
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} units="mi" />,
      ),
    );
    expect(page).toContain("any minute now Lands");
    expect(page).not.toContain("14 sec");
  });
});

function nyTime(day: string, hhmm: string): number {
  return Date.parse(`2026-11-${day}T${hhmm}:00-05:00`);
}

describe("Tracker on the Chicago vector at 2 am (ac-2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is Roosting with the roost stats and requests night", () => {
    const flight = flightFrom("chicago-overnight");
    vi.setSystemTime(nyTime("20", "02:00"));
    const html = renderToStaticMarkup(
      <Tracker flight={flight} offsetMs={0} timeZone={TZ} units="mi" />,
    );
    const page = text(html);
    expect(page).toContain("Roosting");
    expect(page).toContain("Gerald is on the way to Priya");
    expect(page).toContain("Night one of a two-day flight to Priya");
    expect(page).toContain("first light Takes off again");
    expect(page).toContain("this afternoon Lands, roughly");
    expect(statsOf(flight)).not.toMatch(/\d{1,2}:\d{2}\s?(am|pm)/i);
    expect(page).not.toContain("Fri 4 pm");
    expect(page).toMatch(/(A barn|A water tower|A ledge) Tonight's roost/);
    expect(page).not.toContain("Lands in");
    expect(html).toMatch(/<section[^>]*data-night="true"/);
  });

  it("does not request night at noon on the first day", () => {
    const flight = flightFrom("chicago-overnight");
    vi.setSystemTime(nyTime("19", "12:00"));
    const html = renderToStaticMarkup(
      <Tracker flight={flight} offsetMs={0} timeZone={TZ} units="mi" />,
    );
    expect(text(html)).toContain("In the air");
    expect(html).toMatch(/<section[^>]*data-night="false"/);
  });

  it("tells the recipient the bird is carrying their note while it roosts", () => {
    const flight = flightFrom("chicago-overnight", { role: "incoming" });
    vi.setSystemTime(nyTime("20", "02:00"));
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} units="mi" />,
      ),
    );
    expect(page).toContain("Carrying a note for you");
    expect(page).not.toContain("Night one");
  });

  it("reads the landing in the viewer's time zone", () => {
    const flight = flightFrom("chicago-overnight");
    const view = trackerView(
      flight,
      nyTime("20", "02:00"),
      "America/Chicago",
      "mi",
    );
    expect(view.state).toBe("roosting");
    expect(view.night).toBe(true);
    expect(view.stats[0]).toEqual({
      value: "first light",
      label: "Takes off again",
    });
    expect(view.stats[1]).toEqual({
      value: "this afternoon",
      label: "Lands, roughly",
    });
    const london = trackerView(
      flight,
      nyTime("20", "02:00"),
      "Europe/London",
      "mi",
    );
    expect(london.stats[1]).toEqual({
      value: "tonight",
      label: "Lands, roughly",
    });
  });
});

describe("Tracker chrome and pins (ac-4)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function render(flight: Flight): string {
    vi.setSystemTime(at(flight, 0.5));
    return renderToStaticMarkup(
      <Tracker flight={flight} offsetMs={0} timeZone={TZ} units="mi" />,
    );
  }

  it("has a back link and names the bird and recipient in the top bar", () => {
    const html = render(flightFrom("calm-short"));
    const back = html.match(/<a [^>]*aria-label="Back to flights"[^>]*>/)?.[0];
    expect(back).toContain('href="/flights"');
    expect(text(html)).toContain("Gerald → Priya In the air");
  });

  it("labels my loft and the recipient's sill on the map", () => {
    const page = text(render(flightFrom("calm-short")));
    expect(page).toContain("Your loft");
    expect(page).toContain("Priya, Philly");
  });

  it("labels the sender's loft and my sill on an incoming flight", () => {
    const html = render(flightFrom("calm-short", { role: "incoming" }));
    const page = text(html);
    expect(page).toContain("Max, Brooklyn");
    expect(page).toContain("Your sill");
    expect(page).toContain("Gerald → You");
  });

  it("names a guest recipient when there is no counterpart", () => {
    const page = text(
      render(
        flightFrom("calm-short", { counterpart: undefined, guestName: "Rosa" }),
      ),
    );
    expect(page).toContain("Gerald → Rosa");
    expect(page).toContain("Rosa, Philly");
  });
});

const FLY_VB = 'viewBox="-24 -12 164 120"';
const PERCH_VB = 'viewBox="-10 -22 140 132"';

function mapBird(html: string): string {
  const svg = html.match(/<svg[^>]*aria-label="Gerald"[^>]*>.*?<\/svg>/s);
  if (!svg) throw new Error("Tracker rendered no map bird");
  return svg[0];
}

function renderAt(flight: Flight, nowMs: number): string {
  vi.setSystemTime(nowMs);
  return renderToStaticMarkup(
    <Tracker flight={flight} offsetMs={0} timeZone={TZ} units="mi" />,
  );
}

function expectPerched(bird: string) {
  expect(bird).toContain(PERCH_VB);
  expect(bird).not.toContain("coo-fly-core");
  expect(bird).not.toContain("coo-fly-tail");
}

describe("the map bird matches the tracker chip (#846)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lands the map bird once the flight is landed", () => {
    const flight = flightFrom("calm-short", { status: "landed" });
    const html = renderAt(flight, at(flight, 0.5));
    expect(text(html)).toContain("Landed");
    expect(text(html)).toContain("Gerald landed at Philly");
    expectPerched(mapBird(html));
    expect(mapBird(html)).toContain("coo-hop");
  });

  it("lands the map bird once the clock passes the arrival", () => {
    const flight = flightFrom("calm-short");
    const html = renderAt(flight, flight.arriveAt! + 1000);
    expect(text(html)).toContain("Gerald landed at Philly");
    expectPerched(mapBird(html));
    expect(mapBird(html)).toContain("coo-hop");
  });

  it("keeps the map bird flapping in the air at 50%", () => {
    const flight = flightFrom("calm-short");
    const html = renderAt(flight, at(flight, 0.5));
    expect(text(html)).toContain("In the air");
    expect(mapBird(html)).toContain(FLY_VB);
    expect(mapBird(html)).toContain("coo-fly-core");
  });

  it("puts the map bird to sleep while it roosts", () => {
    const flight = flightFrom("chicago-overnight");
    const html = renderAt(flight, nyTime("20", "02:00"));
    expect(text(html)).toContain("Roosting");
    expectPerched(mapBird(html));
    expect(mapBird(html)).toContain("coo-snooze");
  });

  it("startles the map bird while it is delayed", () => {
    const flight = flightFrom("delay-minor");
    const delay = flight.plan!.segments.find((s) => s.kind === "delay")!;
    const html = renderAt(flight, (delay.startMs + delay.endMs) / 2);
    expect(text(html)).toContain("Delayed");
    expectPerched(mapBird(html));
    expect(mapBird(html)).toContain("M112 14 L120 4");
  });

  it("perches the map bird before release", () => {
    const flight = flightFrom("calm-short", { status: "scheduled" });
    const html = renderAt(flight, flight.releaseAt - 60_000);
    expect(text(html)).toContain("Scheduled");
    expectPerched(mapBird(html));
    expect(mapBird(html)).not.toContain("coo-hop");
  });
});
