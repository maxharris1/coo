import { describe, expect, it } from "vitest";
import type { RecipientQuote } from "@/server/services/flights/quote";
import { counter, pickerOption, stats, type SyncBird } from "./compose";

const bird = (over: Partial<SyncBird> = {}): SyncBird =>
  ({
    id: "b1",
    name: "Gerald",
    breed: "city",
    speedMph: 45,
    gear: [],
    status: "home",
    busyKind: null,
    busyUntil: null,
    hungry: false,
    tired: false,
    canFly: true,
    ...over,
  }) as SyncBird;

describe("pickerOption", () => {
  it.each([
    ["ready", bird(), { kind: "ready" }, "Ready"],
    ["tired but able", bird({ tired: true }), { kind: "ready" }, "Ready"],
    [
      "hungry",
      bird({ hungry: true }),
      { kind: "hungry", warning: "Hungry. Can fly, but the odds drop." },
      "Hungry",
    ],
    [
      "napping",
      bird({
        status: "busy",
        busyKind: "nap",
        busyUntil: 1,
        canFly: false,
        cannotFlyReason: "busy",
      }),
      { kind: "blocked", reason: "Napping. Can't fly yet." },
      "Napping",
    ],
    [
      "flying",
      bird({ status: "flying", canFly: false, cannotFlyReason: "away" }),
      { kind: "blocked", reason: "Out on a delivery." },
      "Flying",
    ],
    [
      "too tired",
      bird({ tired: true, canFly: false, cannotFlyReason: "tired" }),
      { kind: "blocked", reason: "Too tired to fly. Resting up." },
      "Too tired",
    ],
    [
      "hungry and too tired",
      bird({
        hungry: true,
        tired: true,
        canFly: false,
        cannotFlyReason: "tired",
      }),
      { kind: "blocked", reason: "Too tired to fly. Resting up." },
      "Too tired",
    ],
    [
      "bathing",
      bird({
        status: "busy",
        busyKind: "bath",
        busyUntil: 1,
        canFly: false,
        cannotFlyReason: "busy",
      }),
      { kind: "blocked", reason: "Bathing. Can't fly yet." },
      "Bathing",
    ],
    [
      "on an odd job",
      bird({
        status: "busy",
        busyKind: "job",
        busyUntil: 1,
        canFly: false,
        cannotFlyReason: "busy",
      }),
      { kind: "blocked", reason: "On an odd job. Can't fly yet." },
      "On a job",
    ],
    [
      "on a friend's sill",
      bird({ status: "visiting", canFly: false, cannotFlyReason: "away" }),
      { kind: "blocked", reason: "On a friend's sill." },
      "On a sill",
    ],
    [
      "scheduled",
      bird({ status: "scheduled", canFly: false, cannotFlyReason: "busy" }),
      { kind: "blocked", reason: "Waiting to leave." },
      "Scheduled",
    ],
  ] as const)("a %s bird", (_, b, state, chip) => {
    expect(pickerOption(b)).toEqual({
      id: "b1",
      name: "Gerald",
      speed: "45 mph",
      chip,
      state,
    });
  });

  it("rounds the speed", () => {
    expect(pickerOption(bird({ speedMph: 51.6 })).speed).toBe("52 mph");
  });
});

describe("counter", () => {
  const plain = bird();
  const tube = bird({ gear: ["tube"] });

  it.each([
    [
      "the mock's note",
      "Dinner Saturday? I'll bring the good bread. Do NOT tell Gerald about the bread.",
      plain,
      { text: "79 of 140 characters", over: false },
    ],
    ["an empty note", "", plain, { text: "0 of 140 characters", over: false }],
    [
      "140 with a plain bird",
      "a".repeat(140),
      plain,
      { text: "140 of 140 characters", over: false },
    ],
    [
      "141 with a plain bird",
      "a".repeat(141),
      plain,
      { text: "141 of 140 characters", over: true },
    ],
    [
      "280 with the tube",
      "a".repeat(280),
      tube,
      { text: "280 of 280 characters", over: false },
    ],
    [
      "281 with the tube",
      "a".repeat(281),
      tube,
      { text: "281 of 280 characters", over: true },
    ],
    [
      "surrounding spaces",
      "  hi  ",
      plain,
      { text: "2 of 140 characters", over: false },
    ],
    [
      "an emoji as one",
      "🐦",
      plain,
      { text: "1 of 140 characters", over: false },
    ],
  ] as const)("%s", (_, body, b, expected) => {
    expect(counter(body, b)).toEqual(expected);
  });
});

describe("stats", () => {
  const RELEASE = Date.parse("2026-11-20T14:32:00Z");
  const quote = (
    over: Partial<RecipientQuote["quotes"][number]> = {},
    distanceMi = 81.3,
  ): RecipientQuote => ({
    recipient: { friendId: "f1" } as RecipientQuote["recipient"],
    distanceMi,
    from: { label: "New York" },
    to: { label: "Philadelphia" },
    quotes: [
      {
        birdId: "other",
        releaseAt: RELEASE,
        durationMs: 1,
        arriveAt: RELEASE,
        odds: 0.1,
        roostsOvernight: false,
        factors: [],
        sunsetAt: RELEASE,
      },
      {
        birdId: "b1",
        releaseAt: RELEASE,
        durationMs: 108 * 60_000,
        arriveAt: RELEASE + 108 * 60_000,
        odds: 0.94,
        roostsOvernight: false,
        factors: [],
        sunsetAt: RELEASE,
        ...over,
      },
    ],
  });
  const NY = "America/New_York";

  it.each([
    [
      "the mock's trip",
      quote(),
      "mi",
      {
        distance: "81 mi",
        flightTime: "1h 48m",
        odds: "94%",
        forecast: "Lands around 11:20 am.",
      },
    ],
    [
      "a trip with a leading factor",
      quote({
        odds: 0.715,
        factors: [
          { kind: "headwind", text: "12 mph from the west", effect: "+9 min" },
          {
            kind: "rain",
            text: "Light rain along the route",
            effect: "4% off",
          },
        ],
      }),
      "mi",
      {
        distance: "81 mi",
        flightTime: "1h 48m",
        odds: "72%",
        forecast: "Lands around 11:20 am. 12 mph from the west.",
      },
    ],
    [
      "kilometres",
      quote(),
      "km",
      {
        distance: "131 km",
        flightTime: "1h 48m",
        odds: "94%",
        forecast: "Lands around 11:20 am.",
      },
    ],
    [
      "a short hop",
      quote({ durationMs: 14_000, arriveAt: RELEASE + 14_000 }, 0.2),
      "mi",
      {
        distance: "4 blocks",
        flightTime: "14 sec",
        odds: "94%",
        forecast: "Lands around 9:32 am.",
      },
    ],
  ] as const)("%s", (_, q, units, expected) => {
    expect(stats(q, "b1", NY, units)).toEqual(expected);
  });

  it("has no stats for a bird the quote does not cover", () => {
    expect(stats(quote(), "missing", NY, "mi")).toBeNull();
  });
});
