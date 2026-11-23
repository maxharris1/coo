import { describe, expect, it } from "vitest";
import type { Factor } from "@/server/services/flights/factors";
import type { RecipientQuote } from "@/server/services/flights/quote";
import type { FriendRow } from "@/server/services/friends";
import type { Doodle } from "@/lib/game/notes";
import {
  assignBirds,
  canRelease,
  counter,
  overLimit,
  pickerOption,
  recipientLine,
  releaseBird,
  stats,
  swapBird,
  type SyncBird,
} from "./compose";

const bird = (over: Partial<SyncBird> = {}): SyncBird =>
  ({
    id: "b1",
    name: "Gerald",
    look: "gerald",
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
  ] as const)("a %s bird", (situation, b, state, chip) => {
    expect(pickerOption(b)).toEqual({
      id: "b1",
      name: "Gerald",
      speed: "45 mph",
      look: "gerald",
      breed: "city",
      gear: [],
      chip,
      state,
      wakes: situation === "napping",
    });
  });

  it("carries the bird's look, breed and gear for its face", () => {
    const b = bird({ look: "kevin", breed: "pouter", gear: ["tube"] });
    expect(pickerOption(b)).toMatchObject({
      look: "kevin",
      breed: "pouter",
      gear: ["tube"],
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
        leavesAt: RELEASE,
        airTimeMs: 1,
        durationMs: 1,
        arriveAt: RELEASE,
        odds: 0.1,
        roostsOvernight: false,
        fliesInDark: false,
        factors: [],
        sunsetAt: RELEASE,
        espresso: null,
      },
      {
        birdId: "b1",
        releaseAt: RELEASE,
        leavesAt: RELEASE,
        airTimeMs: 108 * 60_000,
        durationMs: 108 * 60_000,
        arriveAt: RELEASE + 108 * 60_000,
        odds: 0.94,
        roostsOvernight: false,
        fliesInDark: false,
        factors: [],
        sunsetAt: RELEASE,
        espresso: null,
        ...over,
      },
    ],
  });
  const NY = "America/New_York";
  const CLOCK = /\d{1,2}:\d{2}\s?(am|pm)/i;

  it.each([
    [
      "the mock's trip",
      quote(),
      "mi",
      {
        distance: "81 mi",
        flightTime: "1h 48m",
        odds: "94%",
        forecast: "Lands this morning.",
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
        forecast: "Lands this morning. 12 mph from the west.",
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
        forecast: "Lands this morning.",
      },
    ],
    [
      "a long trip in kilometres",
      quote({
        factors: [{ kind: "distance", distanceMi: 712.4, effect: "6% off" }],
      }),
      "km",
      {
        distance: "131 km",
        flightTime: "1h 48m",
        odds: "94%",
        forecast: "Lands this morning. 1146 km is a long way.",
      },
    ],
    [
      "a long trip in miles",
      quote({
        factors: [{ kind: "distance", distanceMi: 712.4, effect: "6% off" }],
      }),
      "mi",
      {
        distance: "81 mi",
        flightTime: "1h 48m",
        odds: "94%",
        forecast: "Lands this morning. 712 mi is a long way.",
      },
    ],
    [
      "a short hop",
      quote(
        { airTimeMs: 14_000, durationMs: 14_000, arriveAt: RELEASE + 14_000 },
        0.2,
      ),
      "mi",
      {
        distance: "4 blocks",
        flightTime: "14 sec",
        odds: "94%",
        forecast: "Lands shortly.",
      },
    ],
  ] as const)("%s", (_, q, units, expected) => {
    const said = stats(q, "b1", NY, units);
    expect(said).toEqual(expected);
    expect(said?.forecast).not.toMatch(CLOCK);
  });

  it("has no stats for a bird the quote does not cover", () => {
    expect(stats(quote(), "missing", NY, "mi")).toBeNull();
  });

  describe("a 0.1 mi hop from the East Village", () => {
    const DUSK = Date.parse("2026-11-22T21:40:00Z");
    const AFTERNOON = Date.parse("2026-11-22T19:00:00Z");
    const SUNRISE = Date.parse("2026-11-23T11:52:00Z");
    const AIR = 6_700;
    const overnight = (factors: Factor[] = []) =>
      quote(
        {
          releaseAt: DUSK,
          leavesAt: SUNRISE,
          airTimeMs: AIR,
          durationMs: SUNRISE + AIR - DUSK,
          arriveAt: SUNRISE + AIR,
          odds: 0.88,
          roostsOvernight: true,
          factors,
        },
        0.1,
      );

    it("waits for sunrise after a 4:40 pm release", () => {
      const said = stats(overnight(), "b1", NY, "mi");

      expect(said).toEqual({
        distance: "2 blocks",
        flightTime: "7 sec",
        odds: "88%",
        forecast:
          "Waits for sunrise. Leaves at first light. Lands early tomorrow morning.",
      });
      expect(said?.forecast).not.toMatch(CLOCK);
    });

    it("puts the leading factor after the wait", () => {
      const q = overnight([
        { kind: "headwind", text: "12 mph from the west", effect: "+1 min" },
      ]);

      expect(stats(q, "b1", NY, "mi")?.forecast).toBe(
        "Waits for sunrise. Leaves at first light. Lands early tomorrow morning. 12 mph from the west.",
      );
    });

    const goggled = (factors: Factor[]) =>
      quote(
        {
          releaseAt: DUSK,
          leavesAt: DUSK,
          airTimeMs: AIR,
          durationMs: AIR,
          arriveAt: DUSK + AIR,
          odds: 0.88,
          fliesInDark: true,
          factors,
        },
        0.1,
      );
    const NIGHT: Factor = {
      kind: "night",
      text: "Flying in the dark",
      effect: "3% off",
    };

    it("flies through the night in goggles after a 4:40 pm release", () => {
      const said = stats(goggled([NIGHT]), "b1", NY, "mi");

      expect(said).toEqual({
        distance: "2 blocks",
        flightTime: "7 sec",
        odds: "88%",
        forecast: "Flies through the night (goggles). Lands shortly.",
      });
      expect(said?.forecast).not.toMatch(/sunrise/);
      expect(said?.forecast).not.toMatch(CLOCK);
    });

    it("puts the weather after the night line", () => {
      const q = goggled([
        NIGHT,
        { kind: "headwind", text: "12 mph from the west", effect: "+1 min" },
      ]);

      expect(stats(q, "b1", NY, "mi")?.forecast).toBe(
        "Flies through the night (goggles). Lands shortly. 12 mph from the west.",
      );
    });

    it("says nothing of the night on a daylight hop in goggles", () => {
      const q = quote(
        {
          releaseAt: AFTERNOON,
          leavesAt: AFTERNOON,
          airTimeMs: AIR,
          durationMs: AIR,
          arriveAt: AFTERNOON + AIR,
          odds: 0.88,
          fliesInDark: false,
        },
        0.1,
      );

      expect(stats(q, "b1", NY, "mi")?.forecast).toBe("Lands shortly.");
    });

    it("flies straight over after a 2:00 pm release", () => {
      const q = quote(
        {
          releaseAt: AFTERNOON,
          leavesAt: AFTERNOON,
          airTimeMs: AIR,
          durationMs: AIR,
          arriveAt: AFTERNOON + AIR,
          odds: 0.88,
        },
        0.1,
      );

      expect(stats(q, "b1", NY, "mi")).toEqual({
        distance: "2 blocks",
        flightTime: "7 sec",
        odds: "88%",
        forecast: "Lands shortly.",
      });
    });
  });

  it("keeps door to door for a bird that leaves now and roosts on the way", () => {
    const q = quote({
      roostsOvernight: true,
      airTimeMs: 6 * 60 * 60_000,
      durationMs: 20 * 60 * 60_000,
      arriveAt: RELEASE + 20 * 60 * 60_000,
    });

    expect(stats(q, "b1", NY, "mi")?.forecast).not.toMatch(CLOCK);
    expect(stats(q, "b1", NY, "mi")).toEqual({
      distance: "81 mi",
      flightTime: "20h 00m",
      odds: "94%",
      forecast:
        "Lands early tomorrow morning. Roosts for the night and finishes after sunrise.",
    });
  });

  describe("with an espresso shot (ac-3)", () => {
    const NIGHT_RUN = 11 * 60 * 60_000;
    const roosting = quote({
      roostsOvernight: true,
      airTimeMs: 6 * 60 * 60_000,
      durationMs: 20 * 60 * 60_000,
      arriveAt: RELEASE + 20 * 60 * 60_000,
      factors: [
        { kind: "rain", text: "Light rain along the route", effect: "4% off" },
      ],
      espresso: {
        leavesAt: RELEASE,
        airTimeMs: NIGHT_RUN,
        durationMs: NIGHT_RUN,
        arriveAt: RELEASE + NIGHT_RUN,
        odds: 0.91,
        roostsOvernight: false,
        fliesInDark: true,
        factors: [
          { kind: "night", text: "Flying in the dark", effect: "3% off" },
          { kind: "headwind", text: "12 mph from the west", effect: "+9 min" },
        ],
      },
    });

    it("flies through the night on the variant's time and odds", () => {
      expect(stats(roosting, "b1", NY, "mi", true)?.forecast).not.toMatch(
        CLOCK,
      );
      expect(stats(roosting, "b1", NY, "mi", true)).toEqual({
        distance: "81 mi",
        flightTime: "11h 00m",
        odds: "91%",
        forecast:
          "Flies through the night (espresso). Lands tonight. 12 mph from the west.",
      });
    });

    it("keeps the roosting line when the shot is not used", () => {
      expect(stats(roosting, "b1", NY, "mi")).toEqual({
        distance: "81 mi",
        flightTime: "20h 00m",
        odds: "94%",
        forecast:
          "Lands early tomorrow morning. Roosts for the night and finishes after sunrise. Light rain along the route.",
      });
    });

    it("keeps the plain line when the quote offers no shot", () => {
      expect(stats(quote(), "b1", NY, "mi", true)).toEqual({
        distance: "81 mi",
        flightTime: "1h 48m",
        odds: "94%",
        forecast: "Lands this morning.",
      });
    });
  });
});

describe("recipientLine", () => {
  it.each([
    [
      "the mock's line",
      { where: "Philadelphia", distanceMi: 81.3 },
      "mi",
      "Philadelphia, 81 miles as the pigeon flies",
    ],
    [
      "in kilometres",
      { where: "Philadelphia", distanceMi: 81.3 },
      "km",
      "Philadelphia, 131 kilometres as the pigeon flies",
    ],
    [
      "no place name",
      { where: null, distanceMi: 1 },
      "mi",
      "1 mile as the pigeon flies",
    ],
    ["no roost", { where: null, distanceMi: null }, "mi", "No roost yet"],
  ] as const)("%s", (_, place, units, expected) => {
    const friend = { id: "u2", name: "Priya", handle: "priya", ...place };
    expect(recipientLine(friend as FriendRow, units)).toBe(expected);
  });
});

describe("releaseBird", () => {
  const flock = (over: Partial<SyncBird>) =>
    bird({
      focus: 3,
      navigation: 3,
      level: 1,
      belly: 80,
      feathers: 80,
      energy: 80,
      sulking: false,
      ...over,
    });

  it("picks the fastest bird that can fly", () => {
    const slow = flock({ id: "b1", speedMph: 40 });
    const fast = flock({ id: "b2", speedMph: 55 });
    const grounded = flock({ id: "b3", speedMph: 70, canFly: false });
    expect(releaseBird([slow, fast, grounded])).toBe(fast);
  });

  it("is null when nobody can fly", () => {
    expect(releaseBird([bird({ canFly: false })])).toBeNull();
  });
});

describe("canRelease", () => {
  const fits = { text: "5 of 140 characters", over: false };
  const over = { text: "141 of 140 characters", over: true };
  const doodle: Doodle = {
    v: 1,
    w: 300,
    h: 200,
    strokes: [{ color: "ink", width: "fine", points: [[10, 20]] }],
  };

  it.each([
    ["text only", { body: "Hello", doodle: null }, fits, "Gerald", false, true],
    ["a doodle only", { body: "", doodle }, fits, "Gerald", false, true],
    [
      "text and a doodle",
      { body: "Hello", doodle },
      fits,
      "Gerald",
      false,
      true,
    ],
    [
      "an empty pad and empty text",
      { body: "", doodle: null },
      fits,
      "Gerald",
      false,
      false,
    ],
    [
      "an empty pad and only spaces",
      { body: "   ", doodle: null },
      fits,
      "Gerald",
      false,
      false,
    ],
    [
      "text over the limit",
      { body: "Hello", doodle: null },
      over,
      "Gerald",
      false,
      false,
    ],
    [
      "text over the limit with a doodle",
      { body: "Hello", doodle },
      over,
      "Gerald",
      false,
      false,
    ],
    ["no ready bird", { body: "Hello", doodle }, fits, null, false, false],
    [
      "a release in flight",
      { body: "Hello", doodle },
      fits,
      "Gerald",
      true,
      false,
    ],
  ] as const)("%s", (_, note, count, birdName, sending, expected) => {
    expect(canRelease(note, count, birdName, sending)).toBe(expected);
  });
});

describe("assignBirds", () => {
  const flier = (
    id: string,
    name: string,
    speedMph: number,
    over: Partial<SyncBird> = {},
  ) =>
    bird({
      id,
      name,
      speedMph,
      focus: 3,
      navigation: 3,
      level: 1,
      belly: 80,
      feathers: 80,
      energy: 80,
      sulking: false,
      ...over,
    });
  const friend = (id: string, distanceMi: number | null) =>
    ({ id, name: id, handle: id, where: null, distanceMi }) as FriendRow;

  it("gives three recipients three distinct ready birds, the fastest on the farthest friend", () => {
    const flock = [
      flier("slow", "Brenda", 38),
      flier("grounded", "Crumbs", 80, { canFly: false }),
      flier("fast", "Gerald", 60),
      flier("mid", "Pip", 48),
    ];
    const friends = [
      friend("near", 5),
      friend("far", 300),
      friend("middle", 80),
    ];

    expect(assignBirds(friends, flock)).toEqual([
      { id: "near", birdId: "slow" },
      { id: "far", birdId: "fast" },
      { id: "middle", birdId: "mid" },
    ]);
  });

  it("puts a friend with no roost last and leaves rows without a ready bird empty", () => {
    const flock = [flier("fast", "Gerald", 60), flier("slow", "Brenda", 38)];
    const friends = [
      friend("unknown", null),
      friend("near", 5),
      friend("far", 300),
    ];

    expect(assignBirds(friends, flock)).toEqual([
      { id: "unknown", birdId: null },
      { id: "near", birdId: "slow" },
      { id: "far", birdId: "fast" },
    ]);
  });
});

describe("swapBird", () => {
  const rows = [
    { id: "a", birdId: "b1" },
    { id: "b", birdId: "b2" },
    { id: "c", birdId: null },
  ];

  it("trades birds when the picked bird is on another row", () => {
    expect(swapBird(rows, "a", "b2")).toEqual([
      { id: "a", birdId: "b2" },
      { id: "b", birdId: "b1" },
      { id: "c", birdId: null },
    ]);
  });

  it("gives a free bird to the row and frees the row's old bird", () => {
    expect(swapBird(rows, "b", "b3")).toEqual([
      { id: "a", birdId: "b1" },
      { id: "b", birdId: "b3" },
      { id: "c", birdId: null },
    ]);
  });

  it("moves a bird onto an empty row and empties the row it left", () => {
    expect(swapBird(rows, "c", "b1")).toEqual([
      { id: "a", birdId: null },
      { id: "b", birdId: "b2" },
      { id: "c", birdId: "b1" },
    ]);
  });

  it("leaves the rows alone for an unknown friend", () => {
    expect(swapBird(rows, "z", "b2")).toEqual(rows);
  });
});

describe("overLimit", () => {
  const plain = bird({ id: "b1", name: "Gerald", gear: [] });
  const tubed = bird({ id: "b2", name: "Brenda", gear: ["tube"] });
  const rows = [
    { id: "a", birdId: "b2" },
    { id: "b", birdId: "b1" },
  ];

  it("names the bird whose tube the note overflows", () => {
    expect(overLimit("x".repeat(141), rows, [plain, tubed])).toEqual({
      birdName: "Gerald",
      limit: 140,
    });
  });

  it("is null when every assigned bird can carry the note", () => {
    expect(overLimit("x".repeat(140), rows, [plain, tubed])).toBeNull();
  });

  it("ignores birds that are not assigned to a row", () => {
    expect(
      overLimit(
        "x".repeat(141),
        [
          { id: "a", birdId: "b2" },
          { id: "b", birdId: null },
        ],
        [plain, tubed],
      ),
    ).toBeNull();
  });
});
