import { describe, expect, it } from "vitest";
import type { Flight } from "@/server/services/flights/shape";
import { takeoffCopy } from "./takeoffCopy";

const RELEASE = Date.parse("2026-11-20T14:32:00Z");
const ARRIVE = Date.parse("2026-11-20T16:20:00Z");
const ZONE = "America/New_York";

const flight = (over: Partial<Flight> = {}): Flight =>
  ({
    id: "f1",
    bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
    counterpart: { id: "u2", name: "Priya", handle: "priya" },
    releaseAt: RELEASE,
    arriveAt: ARRIVE,
    ...over,
  }) as Flight;

describe("takeoffCopy", () => {
  it("writes the mock's lines for a bird going to a friend", () => {
    expect(takeoffCopy(flight(), "he", ZONE)).toEqual({
      released: "Released 9:32 am",
      headline: "And he's off",
      note: "Gerald has your note for Priya. He should land around 11:20 am.",
    });
  });

  it("agrees with the bird's pronoun", () => {
    expect(takeoffCopy(flight(), "she", ZONE)).toMatchObject({
      headline: "And she's off",
      note: "Gerald has your note for Priya. She should land around 11:20 am.",
    });
    expect(takeoffCopy(flight(), "they", ZONE)).toMatchObject({
      headline: "And they're off",
      note: "Gerald has your note for Priya. They should land around 11:20 am.",
    });
  });

  it("names a guest recipient", () => {
    const toGuest = flight({ counterpart: undefined, guestName: "Sam" });
    expect(takeoffCopy(toGuest, "he", ZONE).note).toBe(
      "Gerald has your note for Sam. He should land around 11:20 am.",
    );
  });

  it("drops the landing sentence when no arrival is known", () => {
    expect(takeoffCopy(flight({ arriveAt: undefined }), "he", ZONE).note).toBe(
      "Gerald has your note for Priya.",
    );
  });

  it("formats times in the given zone", () => {
    expect(takeoffCopy(flight(), "he", "Europe/London").released).toBe(
      "Released 2:32 pm",
    );
  });
});
