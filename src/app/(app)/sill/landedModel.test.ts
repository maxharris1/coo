import { describe, expect, it } from "vitest";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import {
  countdownLine,
  landedState,
  postmark,
  tripSummary,
} from "./landedModel";

const MINUTE = 60_000;
const created = Date.parse("2026-11-19T15:04:00Z");
const arrived = created + 112 * MINUTE;
const leaves = arrived + 30 * MINUTE;

const visit = (over: Partial<SyncVisit> = {}): SyncVisit => ({
  id: "v1",
  bird: { id: "b1", name: "Dumpling", breed: "city", look: "slate", gear: [] },
  owner: { id: "u1", name: "Priya", handle: "priya" },
  note: { id: "n1", body: "Dumplings tonight?", createdAt: created },
  arrivedAt: arrived,
  leavesAt: leaves,
  status: "waiting",
  snackGiven: false,
  flight: { distanceMi: 81.2, durationMs: 112 * MINUTE, delayKind: "minor" },
  ...over,
});

const philly = { name: "Philadelphia", region: "PA" };

describe("landedState", () => {
  it("is waiting before the bird leaves and gone from leavesAt on", () => {
    expect(landedState(visit(), arrived)).toBe("waiting");
    expect(landedState(visit(), leaves - 1)).toBe("waiting");
    expect(landedState(visit(), leaves)).toBe("gone");
    expect(landedState(visit(), leaves + 5 * MINUTE)).toBe("gone");
  });
});

describe("tripSummary", () => {
  it("reads like the mock for the mock's flight", () => {
    expect(tripSummary(visit(), philly, "mi")).toBe(
      "From Priya in Philadelphia. 81 miles in 1h 52m, with one snack stop nobody will discuss.",
    );
  });

  it("drops the city when the sender's city is unknown", () => {
    expect(tripSummary(visit(), null, "mi")).toBe(
      "From Priya. 81 miles in 1h 52m, with one snack stop nobody will discuss.",
    );
  });

  it("words the tail by how the flight went", () => {
    const flight = (delayKind: SyncVisit["flight"]["delayKind"]) =>
      tripSummary(
        visit({
          flight: { distanceMi: 81.2, durationMs: 112 * MINUTE, delayKind },
        }),
        philly,
        "mi",
      );
    expect(flight("none")).toBe(
      "From Priya in Philadelphia. 81 miles in 1h 52m.",
    );
    expect(flight(null)).toBe(
      "From Priya in Philadelphia. 81 miles in 1h 52m.",
    );
    expect(flight("major")).toBe(
      "From Priya in Philadelphia. 81 miles in 1h 52m, the long way round.",
    );
  });

  it("uses the reader's units", () => {
    expect(tripSummary(visit(), philly, "km")).toBe(
      "From Priya in Philadelphia. 131 kilometres in 1h 52m, with one snack stop nobody will discuss.",
    );
  });

  it("stops after the sender when the flight has no distance or time", () => {
    expect(
      tripSummary(
        visit({
          flight: { distanceMi: null, durationMs: null, delayKind: null },
        }),
        philly,
        "mi",
      ),
    ).toBe("From Priya in Philadelphia.");
  });
});

describe("postmark", () => {
  it("stamps the mock's date and place", () => {
    expect(postmark(created, philly, "America/New_York")).toEqual({
      date: "NOV 19",
      place: "PHILA, PA",
    });
  });

  it("dates the stamp in the reader's time zone", () => {
    const lateEvening = Date.parse("2026-11-20T03:00:00Z");
    expect(postmark(lateEvening, philly, "America/New_York").date).toBe(
      "NOV 19",
    );
    expect(postmark(lateEvening, philly, "Europe/London").date).toBe("NOV 20");
  });

  it("shows the date alone when the sender's city is unknown", () => {
    expect(postmark(created, null, "America/New_York")).toEqual({
      date: "NOV 19",
      place: null,
    });
  });

  it("fits other city names on the stamp", () => {
    const place = (name: string, region: string | null) =>
      postmark(created, { name, region }, "America/New_York").place;
    expect(place("Boston", null)).toBe("BOSTON");
    expect(place("New York", "NY")).toBe("NEW YORK, NY");
    expect(place("San Francisco", "CA")).toBe("SF, CA");
  });
});

describe("countdownLine", () => {
  it("reads like the mock with 30 minutes left", () => {
    expect(countdownLine(visit(), leaves - 30 * MINUTE)).toBe(
      "Pigeons only fly home, so replies ride back free. Dumpling leaves in 30 minutes with or without one.",
    );
  });

  it("rounds up to whole minutes and says one minute in the singular", () => {
    expect(countdownLine(visit(), leaves - 90_000)).toContain(
      "Dumpling leaves in 2 minutes",
    );
    expect(countdownLine(visit(), leaves - 1_000)).toContain(
      "Dumpling leaves in 1 minute with",
    );
  });
});
