import { describe, expect, it } from "vitest";
import flightLog from "../../config/copy/flight-log.json";
import notifications from "../../config/copy/notifications.json";
import sms from "../../config/copy/sms.json";
import type { BirdStatus } from "./game/types";
import {
  clockTime,
  distance,
  duration,
  fill,
  fuzzyWhen,
  greeting,
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
    [0, "0 blocks"],
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
    [0, "0 metres"],
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
    expect(
      clockTime(new Date("2026-11-20T05:00:00Z"), "America/New_York"),
    ).toBe("12:00 am");
    expect(
      clockTime(new Date("2026-11-20T17:00:00Z"), "America/New_York"),
    ).toBe("12:00 pm");
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
    expect(
      fill("Nothing to report. {He} would like that noted.", {}, pronoun),
    ).toBe(text);
  });

  it("fills every pronoun form in one line", () => {
    expect(
      fill("{He} said {he} took {his} map, so leave {him} be.", {}, "they"),
    ).toBe("They said they took their map, so leave them be.");
    expect(
      fill(sms["share-template"], { url: "https://coo.example/g/x" }, "she"),
    ).toBe(
      "I sent you a pigeon. For real. Watch her fly to you: https://coo.example/g/x",
    );
  });

  it.each([
    [
      "he",
      "Tailwind. He is taking the credit.",
      "No reply this time. He is pretending not to mind.",
      "He has opinions about it.",
    ],
    [
      "she",
      "Tailwind. She is taking the credit.",
      "No reply this time. She is pretending not to mind.",
      "She has opinions about it.",
    ],
    [
      "they",
      "Tailwind. They are taking the credit.",
      "No reply this time. They are pretending not to mind.",
      "They have opinions about it.",
    ],
  ] as const)(
    "agrees the verb with %s in the copy",
    (pronoun, tailwind, homeEmpty, hungry) => {
      expect(fill(flightLog.weather_tailwind[0], {}, pronoun)).toBe(tailwind);
      expect(fill(notifications["home-empty"].body, {}, pronoun)).toBe(
        homeEmpty,
      );
      expect(fill(notifications.hungry.body, {}, pronoun)).toBe(hungry);
    },
  );

  it("covers every copy line whose subject is a pronoun", () => {
    const strings = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : value && typeof value === "object"
          ? Object.values(value).flatMap(strings)
          : [];
    const subjectLines = [flightLog, notifications, sms]
      .flatMap(strings)
      .filter((line) => /\{[Hh]e\} [a-z]/.test(line));
    expect(subjectLines.sort()).toEqual(
      [
        flightLog.cruising[3],
        flightLog.weather_tailwind[0],
        notifications["home-empty"].body,
        notifications.hungry.body,
      ].sort(),
    );
  });

  it.each([
    ["{He} takes the long way.", "They take the long way."],
    ["{He} flies home.", "They fly home."],
    ["{He} watches the river.", "They watch the river."],
    ["{He} misses nothing.", "They miss nothing."],
    ["{He} goes quiet.", "They go quiet."],
    ["{He} was asleep.", "They were asleep."],
    ["{He} isn't hungry.", "They aren't hungry."],
    ["{He} doesn't mind.", "They don't mind."],
    ["{He} would like that noted.", "They would like that noted."],
    ["{He} said nothing.", "They said nothing."],
    ["Then {he} lands.", "Then they land."],
    [
      "{bird} is late and {his} map is wet.",
      "Gerald is late and their map is wet.",
    ],
  ])("uses plural verbs for they in %j", (template, text) => {
    expect(fill(template, { bird: "Gerald" }, "they")).toBe(text);
  });

  it.each([
    ["he", "Gerald takes the long way. He takes the long way. Then he lands."],
    [
      "she",
      "Gerald takes the long way. She takes the long way. Then she lands.",
    ],
  ] as const)("keeps singular verbs for %s", (pronoun, text) => {
    expect(
      fill(
        "{bird} takes the long way. {He} takes the long way. Then {he} lands.",
        { bird: "Gerald" },
        pronoun,
      ),
    ).toBe(text);
  });

  it("drops the sentence that needs a missing token", () => {
    const line =
      "Crossed the river. Used {place} to check {his} bearings. Close enough.";
    expect(fill(line, {}, "he")).toBe("Crossed the river. Close enough.");
    expect(fill(line, { place: "the Ben Franklin Bridge" }, "he")).toBe(
      "Crossed the river. Used the Ben Franklin Bridge to check his bearings. Close enough.",
    );
  });

  it("returns an empty string when every sentence needs a missing token", () => {
    expect(fill("Passed over {place}.", {})).toBe("");
  });

  it("fills every flight log line with no braces left", () => {
    const tokens = {
      bird: "Gerald",
      place: "Trenton",
      speed: "45 mph",
      friend: "Priya",
    };
    for (const [kind, lines] of Object.entries(flightLog)) {
      if (!Array.isArray(lines)) continue;
      for (const pronoun of ["he", "she", "they"] as const) {
        for (const line of lines) {
          expect(fill(line, tokens, pronoun), `${kind}: ${line}`).not.toMatch(
            /[{}]/,
          );
        }
      }
    }
  });
});

describe("greeting", () => {
  const at = (iso: string) => new Date(iso).getTime();
  const flock = (...statuses: BirdStatus[]) =>
    statuses.map((status) => ({ status }));
  const job = { status: "busy" as const, busyKind: "job" };
  const nap = { status: "busy" as const, busyKind: "nap" };
  const bath = { status: "busy" as const, busyKind: "bath" };
  const NY = "America/New_York";
  const morning = at("2026-11-20T14:20:00Z");
  const evening = at("2026-11-22T22:55:00Z");

  it("reads the mock's line for a morning with three home and one flying", () => {
    expect(greeting(morning, NY, flock("home", "flying", "home", "home"))).toBe(
      "Morning. Three birds home, one flying.",
    );
  });

  it("calls a flying delivery flying, not a job, at 5:55 PM ET", () => {
    const line = greeting(evening, NY, flock("home", "flying"));
    expect(line).toBe("Evening. One bird home, one flying.");
    expect(line).not.toContain("job");
  });

  it("names the time of day in the caller's timezone", () => {
    const birds = flock("home");
    expect(greeting(at("2026-11-20T18:00:00Z"), NY, birds)).toMatch(
      /^Afternoon\. /,
    );
    expect(greeting(at("2026-11-20T23:30:00Z"), NY, birds)).toMatch(
      /^Evening\. /,
    );
    expect(greeting(at("2026-11-21T06:00:00Z"), NY, birds)).toMatch(
      /^Night\. /,
    );
    expect(
      greeting(at("2026-11-21T06:00:00Z"), "Europe/London", birds),
    ).toMatch(/^Morning\. /);
  });

  it("starts the evening at 17:00 in the loft timezone", () => {
    const birds = flock("home");
    expect(greeting(at("2026-11-22T21:59:00Z"), NY, birds)).toMatch(
      /^Afternoon\. /,
    );
    expect(greeting(at("2026-11-22T22:00:00Z"), NY, birds)).toMatch(
      /^Evening\. /,
    );
  });

  it("counts birds home in words", () => {
    expect(greeting(morning, NY, flock("home"))).toBe(
      "Morning. One bird home.",
    );
    expect(greeting(morning, NY, flock("home", "scheduled"))).toBe(
      "Morning. Two birds home.",
    );
    expect(greeting(morning, NY, flock())).toBe("Morning. No birds yet.");
  });

  it("counts an odd job as out on a job, not home", () => {
    expect(greeting(evening, NY, [{ status: "home" }, job])).toBe(
      "Evening. One bird home, one out on a job.",
    );
    expect(greeting(morning, NY, [job, job])).toBe(
      "Morning. No birds home, two out on jobs.",
    );
  });

  it("puts a visiting bird on a sill", () => {
    expect(greeting(morning, NY, flock("visiting"))).toBe(
      "Morning. No birds home, one on a sill.",
    );
    expect(
      greeting(morning, NY, flock("flying", "visiting", "home", "home")),
    ).toBe("Morning. Two birds home, one flying, one on a sill.");
  });

  it("joins flying, sill and job counts in that order", () => {
    expect(
      greeting(morning, NY, [
        ...flock("flying", "visiting"),
        nap,
        ...flock("home", "home"),
      ]),
    ).toBe("Morning. Three birds home, one flying, one on a sill.");
    expect(greeting(morning, NY, [job, ...flock("visiting", "flying")])).toBe(
      "Morning. No birds home, one flying, one on a sill, one out on a job.",
    );
  });

  it("counts napping and bathing birds as home", () => {
    expect(greeting(morning, NY, [nap, bath])).toBe("Morning. Two birds home.");
  });
});

describe("fuzzyWhen", () => {
  const ny = "America/New_York";
  const nyAt = (local: string) => Date.parse(`${local}-05:00`);
  const CLOCK = /\d{1,2}:\d{2}\s?(am|pm)/i;

  it.each([
    ["2026-11-23T04:59", "overnight"],
    ["2026-11-23T05:00", "early this morning"],
    ["2026-11-23T07:59", "early this morning"],
    ["2026-11-23T08:00", "this morning"],
    ["2026-11-23T11:29", "this morning"],
    ["2026-11-23T11:30", "around midday"],
    ["2026-11-23T13:29", "around midday"],
    ["2026-11-23T13:30", "this afternoon"],
    ["2026-11-23T16:59", "this afternoon"],
    ["2026-11-23T17:00", "this evening"],
    ["2026-11-23T19:59", "this evening"],
    ["2026-11-23T20:00", "tonight"],
    ["2026-11-23T23:59", "tonight"],
    ["2026-11-24T00:00", "overnight"],
  ])("puts %s, seen just after Monday midnight, %j", (local, phrase) => {
    const text = fuzzyWhen(nyAt(local), nyAt("2026-11-23T00:00"), ny);
    expect(text).toBe(phrase);
    expect(text).not.toMatch(CLOCK);
  });

  it.each([
    ["2026-11-22T21:00", "2026-11-23T02:00", "overnight"],
    ["2026-11-22T21:00", "2026-11-23T06:30", "early tomorrow morning"],
    ["2026-11-23T01:00", "2026-11-23T03:00", "overnight"],
    ["2026-11-23T01:00", "2026-11-23T06:30", "early this morning"],
  ])("calls the coming night overnight: %s to %s is %j", (now, at, phrase) => {
    expect(fuzzyWhen(nyAt(at), nyAt(now), ny)).toBe(phrase);
  });

  it.each([
    ["2026-11-23T14:00", "this afternoon"],
    ["2026-11-24T05:30", "early tomorrow morning"],
    ["2026-11-24T09:00", "tomorrow morning"],
    ["2026-11-24T12:00", "around midday tomorrow"],
    ["2026-11-24T15:00", "tomorrow afternoon"],
    ["2026-11-24T18:00", "tomorrow evening"],
    ["2026-11-24T22:00", "tomorrow night"],
    ["2026-11-25T03:00", "overnight Wednesday"],
    ["2026-11-25T06:00", "early Wednesday morning"],
    ["2026-11-25T09:00", "Wednesday morning"],
    ["2026-11-25T12:00", "around midday Wednesday"],
    ["2026-11-25T14:00", "Wednesday afternoon"],
    ["2026-11-25T18:00", "Wednesday evening"],
    ["2026-11-29T21:00", "Sunday night"],
    ["2026-11-30T09:00", "Monday, November 30, in the morning"],
    ["2026-12-01T14:00", "Tuesday, December 1, in the afternoon"],
  ])("names the day of %s, seen Monday 9 am, %j", (local, phrase) => {
    expect(fuzzyWhen(nyAt(local), nyAt("2026-11-23T09:00"), ny)).toBe(phrase);
  });

  it.each([
    [0, "any minute now"],
    [9 * 60_000 + 59_000, "any minute now"],
    [10 * 60_000, "any minute now"],
    [10 * 60_000 + 1_000, "this morning"],
  ])("says %d ms ahead is %j", (ahead, phrase) => {
    const now = nyAt("2026-11-23T09:00");
    expect(fuzzyWhen(now + ahead, now, ny)).toBe(phrase);
  });

  it("says shortly for a short hop in the quote voice", () => {
    const now = nyAt("2026-11-23T09:00");
    expect(fuzzyWhen(now + 7_000, now, ny, "quote")).toBe("shortly");
    expect(fuzzyWhen(now + 10 * 60_000 + 1_000, now, ny, "quote")).toBe(
      "this morning",
    );
  });

  it("reads one UTC instant in the viewer's time zone", () => {
    const now = Date.parse("2026-11-23T12:00:00Z");
    const at = Date.parse("2026-11-23T15:00:00Z");
    expect(fuzzyWhen(at, now, "America/New_York")).toBe("this morning");
    expect(fuzzyWhen(at, now, "Europe/London")).toBe("this afternoon");
  });

  it("keeps the local wall clock across a daylight saving change", () => {
    const now = Date.parse("2026-03-08T00:30:00-05:00");
    expect(fuzzyWhen(Date.parse("2026-03-08T07:30:00-04:00"), now, ny)).toBe(
      "early this morning",
    );
    expect(fuzzyWhen(Date.parse("2026-03-09T08:00:00-04:00"), now, ny)).toBe(
      "tomorrow morning",
    );
  });
});
