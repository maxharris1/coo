import { describe, expect, it } from "vitest";
import type { Flight } from "@/server/services/flights/shape";
import { homeCopy } from "./homeCopy";

const RELEASE = Date.parse("2026-11-20T16:32:00Z");
const ARRIVE = Date.parse("2026-11-20T18:25:00Z");
const ZONE = "America/New_York";

const flight = (over: Partial<Flight> = {}): Flight =>
  ({
    id: "f1",
    kind: "return",
    bird: { id: "b1", name: "Dumpling", look: "dumpling", gear: [] },
    owner: { id: "u2", name: "Priya", handle: "priya" },
    counterpart: { id: "u1", name: "Max", handle: "max" },
    releaseAt: RELEASE,
    arriveAt: ARRIVE,
    ...over,
  }) as Flight;

describe("homeCopy", () => {
  it("writes the mock's lines for a friend's bird going home", () => {
    expect(homeCopy(flight(), "she", ZONE)).toEqual({
      released: "Released 11:32 am",
      headline: "Homeward bound",
      note: "Dumpling has your reply for Priya. She should land around midday.",
      watch: "Watch her go",
      birdTitle: "Dumpling launching off your sill with the reply",
    });
  });

  it("agrees with the bird's pronoun", () => {
    expect(homeCopy(flight(), "he", ZONE)).toMatchObject({
      headline: "Homeward bound",
      note: "Dumpling has your reply for Priya. He should land around midday.",
      watch: "Watch him go",
    });
    expect(homeCopy(flight(), "they", ZONE)).toMatchObject({
      headline: "Homeward bound",
      note: "Dumpling has your reply for Priya. They should land around midday.",
      watch: "Watch them go",
    });
  });

  it("says a quick hop lands shortly", () => {
    const note = homeCopy(
      flight({ arriveAt: RELEASE + 7_000 }),
      "she",
      ZONE,
    ).note;
    expect(note).toBe(
      "Dumpling has your reply for Priya. She should land shortly.",
    );
    expect(note).not.toMatch(/\d{1,2}:\d{2}\s?[ap]m/i);
  });

  it("drops the landing sentence when no arrival is known", () => {
    expect(homeCopy(flight({ arriveAt: undefined }), "she", ZONE).note).toBe(
      "Dumpling has your reply for Priya.",
    );
  });

  it("formats times in the given zone", () => {
    expect(homeCopy(flight(), "she", "Europe/London").released).toBe(
      "Released 4:32 pm",
    );
  });
});
