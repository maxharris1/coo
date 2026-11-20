import { describe, expect, it } from "vitest";
import flightLog from "../../config/copy/flight-log.json";
import notifications from "../../config/copy/notifications.json";
import sms from "../../config/copy/sms.json";
import {
  clockTime,
  distance,
  duration,
  fill,
  pronounTokens,
} from "./format";

describe("duration", () => {
  it.each([
    [6_480_000, "1h 48m"],
    [14_000, "14 sec"],
    [0, "0 sec"],
    [59_400, "59 sec"],
    [59_600, "1 min"],
    [12 * 60_000, "12 min"],
    [41 * 60_000 + 20_000, "41 min"],
    [59 * 60_000 + 40_000, "1h 00m"],
    [67 * 60_000, "1h 07m"],
    [2 * 3_600_000, "2h 00m"],
    [26 * 3_600_000 + 5 * 60_000, "26h 05m"],
    [-5_000, "0 sec"],
  ])("formats %d ms as %j", (ms, text) => {
    expect(duration(ms)).toBe(text);
  });
});

describe("distance", () => {
  it.each([
    [0.15, "3 blocks"],
    [0.05, "1 block"],
    [0.01, "1 block"],
    [0, "1 block"],
    [0.4, "8 blocks"],
    [0.49, "10 blocks"],
    [0.5, "1 mile"],
    [1.4, "1 mile"],
    [25, "25 miles"],
    [81.4, "81 miles"],
    [712.6, "713 miles"],
  ])("formats %d miles in mi as %j", (miles, text) => {
    expect(distance(miles, "mi")).toBe(text);
  });

  it.each([
    [81.4, "131 kilometres"],
    [0.6, "1 kilometre"],
    [0.15, "250 metres"],
    [0.25, "400 metres"],
    [0.01, "50 metres"],
  ])("formats %d miles in km as %j", (miles, text) => {
    expect(distance(miles, "km")).toBe(text);
  });
});

describe("clockTime", () => {
  const at = new Date("2026-11-20T16:20:00Z");

  it.each([
    ["America/New_York", "11:20 am"],
    ["America/Los_Angeles", "8:20 am"],
    ["Europe/London", "4:20 pm"],
    ["Asia/Kolkata", "9:50 pm"],
  ])("shows the instant in %s as %j", (tz, text) => {
    expect(clockTime(at, tz)).toBe(text);
  });

  it("shows midnight and noon as 12", () => {
    expect(clockTime(new Date("2026-11-20T05:00:00Z"), "America/New_York")).toBe(
      "12:00 am",
    );
    expect(clockTime(new Date("2026-11-20T17:00:00Z"), "America/New_York")).toBe(
      "12:00 pm",
    );
  });
});

describe("pronounTokens", () => {
  it.each([
    ["he", { He: "He", he: "he", him: "him", his: "his" }],
    ["she", { He: "She", he: "she", him: "her", his: "her" }],
    ["they", { He: "They", he: "they", him: "them", his: "their" }],
  ] as const)("gives the %s forms", (pronoun, forms) => {
    expect(pronounTokens(pronoun)).toEqual(forms);
  });
});

describe("fill", () => {
  it("replaces named tokens", () => {
    expect(
      fill(notifications["landed-out"].body, {
        friend: "Priya",
        distance: "81 miles",
        duration: "1h 48m",
        seeds: 12,
      }),
    ).toBe("Priya has it. 81 miles in 1h 48m. You earned 12 seeds.");
  });

  it.each([
    ["he", "Nothing to report. He would like that noted."],
    ["she", "Nothing to report. She would like that noted."],
    ["they", "Nothing to report. They would like that noted."],
  ] as const)("fills pronoun tokens for %s", (pronoun, text) => {
    expect(fill("Nothing to report. {He} would like that noted.", {}, pronoun)).toBe(text);
  });

  it("fills every pronoun form in one line", () => {
    expect(
      fill("{He} said {he} took {his} map, so leave {him} be.", {}, "they"),
    ).toBe("They said they took their map, so leave them be.");
    expect(fill(sms["share-template"], { url: "https://coo.example/g/x" }, "she")).toBe(
      "I sent you a pigeon. For real. Watch her fly to you: https://coo.example/g/x",
    );
  });

  it("drops the sentence that needs a missing token", () => {
    const line = "Crossed the river. Used {place} to check {his} bearings. Close enough.";
    expect(fill(line, {}, "he")).toBe("Crossed the river. Close enough.");
    expect(fill(line, { place: "the Ben Franklin Bridge" }, "he")).toBe(
      "Crossed the river. Used the Ben Franklin Bridge to check his bearings. Close enough.",
    );
  });

  it("returns an empty string when every sentence needs a missing token", () => {
    expect(fill("Passed over {place}.", {})).toBe("");
  });

  it("fills every flight log line with no braces left", () => {
    const tokens = { bird: "Gerald", place: "Trenton", speed: "45 mph", friend: "Priya" };
    for (const [kind, lines] of Object.entries(flightLog)) {
      if (!Array.isArray(lines)) continue;
      for (const pronoun of ["he", "she", "they"] as const) {
        for (const line of lines) {
          expect(fill(line, tokens, pronoun), `${kind}: ${line}`).not.toMatch(/[{}]/);
        }
      }
    }
  });
});
