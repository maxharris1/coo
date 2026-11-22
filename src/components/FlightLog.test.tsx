import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import flightLogCopy from "../../config/copy/flight-log.json";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { Flight } from "@/server/services/flights/shape";
import { FlightLog, flightLog } from "./FlightLog";
import { Tracker } from "./Tracker";

const TZ = "America/Chicago";

type Vector = { name: string; input: FlightInput; plan: FlightPlan };

const vectors: Vector[] = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors;

const DECILES = [
  "Brooklyn, NY",
  "Newark, NJ",
  "Allentown, PA",
  "Harrisburg, PA",
  "Altoona, PA",
  "Pittsburgh, PA",
  "Akron, OH",
  "Toledo, OH",
  "South Bend, IN",
  "Gary, IN",
  "Chicago, IL",
];

function flightFrom(name: string, over: Partial<Flight> = {}): Flight {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`no vector ${name}`);
  return {
    id: v.input.flightId,
    kind: "delivery",
    status: "landed",
    bird: { id: "b1", name: "Gerald", look: "gerald", gear: v.input.gear },
    owner: { id: "u1", name: "Max", handle: "max" },
    counterpart: { id: "u2", name: "Priya", handle: "priya" },
    from: { ...v.input.from, label: "Brooklyn" },
    to: { ...v.input.to, label: "Chicago" },
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

function rows(html: string): string[] {
  return [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(([, row]) =>
    row
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

const TAKEOFF = "Left in a hurry. Forgot nothing, owns nothing.";
const SUNRISE = "Up at first light. Back in the air.";
const LANDING = "Touched down. Pretended it was easy.";

describe("flight log for the Chicago vector at arrival (ac-2)", () => {
  const cases = [
    { places: "no place names", placeNames: {}, dusk: "Too dark to fly." },
    {
      places: "all deciles named",
      placeNames: { deciles: DECILES, events: {}, dest: null },
      dusk: /^Too dark to fly\. Asleep on a ledge near [A-Z][\w ]+, [A-Z]{2}\.$/,
    },
  ];

  for (const { places, placeNames, dusk } of cases) {
    it(`has takeoff, dusk, sunrise and landing in time order with ${places}`, () => {
      const flight = flightFrom("chicago-overnight", { placeNames });
      const log = flightLog(flight, flight.plan!.arriveAtMs);
      const texts = log.map((line) => line.text);

      const landing = texts.indexOf(LANDING);
      const sunrise = texts.indexOf(SUNRISE);
      const duskAt = texts.findIndex((t) =>
        typeof dusk === "string" ? t === dusk : dusk.test(t),
      );
      const takeoff = texts.indexOf(TAKEOFF);
      expect([landing, sunrise, duskAt, takeoff].every((i) => i >= 0)).toBe(
        true,
      );
      expect(landing).toBeLessThan(sunrise);
      expect(sunrise).toBeLessThan(duskAt);
      expect(duskAt).toBeLessThan(takeoff);

      const times = log.map((line) => line.atMs);
      expect(times).toEqual([...times].sort((a, b) => b - a));

      for (const text of texts) {
        expect(text).not.toBe("");
        expect(text).not.toMatch(/\{\w+\}/);
      }
    });
  }

  it("renders each line with its clock time and no unfilled token", () => {
    const flight = flightFrom("chicago-overnight");
    const html = renderToStaticMarkup(
      <FlightLog
        flight={flight}
        nowMs={flight.plan!.arriveAtMs}
        timeZone={TZ}
      />,
    );
    expect(html).toContain("Flight log");
    const lines = rows(html);
    expect(lines.length).toBe(
      flightLog(flight, flight.plan!.arriveAtMs).length,
    );
    expect(lines[0]).toMatch(/^\d{1,2}:\d{2} (am|pm) Touched down\./);
    expect(lines.at(-1)).toMatch(/^\d{1,2}:\d{2} (am|pm) Left in a hurry\./);
    for (const line of lines) expect(line).not.toMatch(/\{\w+\}/);
  });

  it("leaves out events whose time has not come", () => {
    const flight = flightFrom("chicago-overnight", { status: "flying" });
    const dusk = flight.plan!.events.find((e) => e.kind === "dusk")!;
    const texts = flightLog(flight, dusk.atMs - 1).map((line) => line.text);
    expect(texts).toContain(TAKEOFF);
    expect(texts.some((t) => t.startsWith("Too dark to fly"))).toBe(false);
    expect(texts).not.toContain(SUNRISE);
    expect(texts).not.toContain(LANDING);
  });

  it("is mounted in the tracker card", () => {
    const flight = flightFrom("chicago-overnight");
    const html = renderToStaticMarkup(
      <Tracker
        flight={flight}
        offsetMs={flight.plan!.arriveAtMs - Date.now()}
        timeZone={TZ}
        units="mi"
      />,
    );
    expect(html).toContain("Flight log");
    expect(rows(html).some((row) => row.includes(LANDING))).toBe(true);
  });
});

describe("weather lines (ac-3)", () => {
  function weatherText(name: string): string | undefined {
    const flight = flightFrom(name);
    return flightLog(flight, flight.plan!.arriveAtMs).find(
      (line) => line.kind === "weather",
    )?.text;
  }

  it("uses the _geared rain line for a rainy flight with goggles", () => {
    const text = weatherText("rain-goggles");
    expect(flightLogCopy.weather_rain_geared).toContain(text);
    expect(flightLogCopy.weather_rain).not.toContain(text);
  });

  it("uses the plain rain line for a rainy flight without gear", () => {
    const text = weatherText("rain-bare");
    expect(flightLogCopy.weather_rain).toContain(text);
  });

  it("uses the _geared snow line for a snowy flight with a scarf", () => {
    expect(flightLogCopy.weather_snow_geared).toContain(
      weatherText("snow-scarf"),
    );
    expect(flightLogCopy.weather_snow).toContain(weatherText("snow-bare"));
  });

  it("names the wind by its side of the route", () => {
    expect(flightLogCopy.weather_headwind).toContain(weatherText("headwind"));
  });
});
