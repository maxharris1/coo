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

describe("Tracker at 50% of the calm vector (ac-1)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows about half the miles and 55 min to land", () => {
    const flight = flightFrom("calm-short");
    vi.setSystemTime(at(flight, 0.5));
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} />,
      ),
    );
    expect(page).toContain("In the air");
    expect(page).toContain("Gerald is over Brooklyn");
    expect(page).toContain("Carrying your note to Priya");
    expect(page).toContain("41 of 82 mi");
    expect(page).toContain("55 min Lands in");
    expect(page).toContain("45 mph Speed");
    expect(page).toMatch(/(Rooftop|Lowish|Quite high) Altitude/);
  });

  it("applies the server clock offset", () => {
    const flight = flightFrom("calm-short");
    vi.setSystemTime(at(flight, 0.5) - 10 * 60_000);
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={10 * 60_000} timeZone={TZ} />,
      ),
    );
    expect(page).toContain("41 of 82 mi");
    expect(page).toContain("55 min Lands in");
  });

  it("reads 'Carrying a note for you' on an incoming flight", () => {
    const flight = flightFrom("calm-short", { role: "incoming" });
    vi.setSystemTime(at(flight, 0.5));
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} />,
      ),
    );
    expect(page).toContain("Carrying a note for you");
  });
});

describe("Tracker on the block vector (ac-3)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows minutes and seconds at 50% with decimal miles", () => {
    const flight = flightFrom("block");
    vi.setSystemTime(at(flight, 0.5));
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} />,
      ),
    );
    expect(page).toContain("1 min 28 sec Lands in");
    expect(page).toContain("1.1 of 2.2 mi");
  });

  it("shows seconds alone 14 s before landing", () => {
    const flight = flightFrom("block");
    vi.setSystemTime(flight.arriveAt! - 14_000);
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} />,
      ),
    );
    expect(page).toContain("14 sec Lands in");
  });

  it("ticks every second on a flight under ten minutes and slower otherwise", () => {
    const block = flightFrom("block");
    const calm = flightFrom("calm-short");
    expect(trackerView(block, at(block, 0.5), TZ).tickMs).toBe(1000);
    expect(trackerView(calm, at(calm, 0.5), TZ).tickMs).toBeGreaterThan(1000);
  });
});

describe("trackerView states", () => {
  it("is Scheduled before release", () => {
    const flight = flightFrom("calm-short", { status: "scheduled" });
    const view = trackerView(flight, flight.releaseAt - 60_000, TZ);
    expect(view.state).toBe("scheduled");
    expect(view.chip).toBe("Scheduled");
    expect(view.progress.text).toBe("0 of 82 mi");
  });

  it("is Landed once the flight has landed", () => {
    const flight = flightFrom("calm-short", { status: "landed" });
    const view = trackerView(flight, flight.arriveAt! + 60_000, TZ);
    expect(view.state).toBe("landed");
    expect(view.chip).toBe("Landed");
    expect(view.progress.text).toBe("82 of 82 mi");
  });

  it("names the place from the latest passed event", () => {
    const flight = flightFrom("calm-short", {
      placeNames: { "1": "Edison, NJ", "2": "Trenton" },
    });
    const view = trackerView(flight, at(flight, 0.5), TZ);
    expect(view.headline).toBe("Gerald is over Edison, NJ");
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
      <Tracker flight={flight} offsetMs={0} timeZone={TZ} />,
    );
    const page = text(html);
    expect(page).toContain("Roosting");
    expect(page).toContain("Asleep near Brooklyn");
    expect(page).toContain("Night one of a two-day flight to Priya");
    expect(page).toContain("7:15 am Takes off again");
    expect(page).toContain("Fri 4 pm Lands, roughly");
    expect(page).toMatch(/(A barn|A water tower|A ledge) Tonight's roost/);
    expect(page).not.toContain("Lands in");
    expect(html).toMatch(/<section[^>]*data-night="true"/);
  });

  it("does not request night at noon on the first day", () => {
    const flight = flightFrom("chicago-overnight");
    vi.setSystemTime(nyTime("19", "12:00"));
    const html = renderToStaticMarkup(
      <Tracker flight={flight} offsetMs={0} timeZone={TZ} />,
    );
    expect(text(html)).toContain("In the air");
    expect(html).toMatch(/<section[^>]*data-night="false"/);
  });

  it("tells the recipient the bird is carrying their note while it roosts", () => {
    const flight = flightFrom("chicago-overnight", { role: "incoming" });
    vi.setSystemTime(nyTime("20", "02:00"));
    const page = text(
      renderToStaticMarkup(
        <Tracker flight={flight} offsetMs={0} timeZone={TZ} />,
      ),
    );
    expect(page).toContain("Carrying a note for you");
    expect(page).not.toContain("Night one");
  });

  it("reads the roost end in the viewer's time zone", () => {
    const flight = flightFrom("chicago-overnight");
    const view = trackerView(flight, nyTime("20", "02:00"), "America/Chicago");
    expect(view.state).toBe("roosting");
    expect(view.night).toBe(true);
    expect(view.stats[0]).toEqual({
      value: "6:15 am",
      label: "Takes off again",
    });
    expect(view.stats[1]).toEqual({
      value: "Fri 3 pm",
      label: "Lands, roughly",
    });
  });
});
