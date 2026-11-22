import { describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import type { FriendRow } from "@/server/services/friends";
import {
  PREFILL_NAME_KEY,
  canGoNext,
  canPickContacts,
  fastestReady,
  friendCard,
  handOffName,
  matches,
  pickContacts,
  sillCard,
  nextHref,
  readyBirds,
  runningLine,
  type FlockBird,
} from "./recipients";

const NYC = { lat: 40.71, lon: -74.0 };
const MORNING = Date.parse("2026-11-20T14:00:00Z");
const NIGHT = Date.parse("2026-11-20T04:00:00Z");

const bird = (over: Partial<FlockBird> = {}): FlockBird => ({
  canFly: true,
  speedMph: 45,
  focus: 3,
  navigation: 3,
  breed: "city",
  level: 1,
  belly: 80,
  feathers: 80,
  energy: 80,
  sulking: false,
  gear: [],
  ...over,
});

const friend = (
  id: string,
  where: string | null,
  distanceMi: number | null,
): FriendRow => ({
  id: id as UserId,
  name: id,
  handle: id,
  shows: "city",
  theyShow: "city",
  where,
  distanceMi,
});

const lineFor = (
  f: FriendRow,
  b: FlockBird | null,
  nowMs = MORNING,
  units: "mi" | "km" = "mi",
) => {
  const card = friendCard(f, { loft: NYC, bird: b, nowMs, units });
  if (card.kind !== "friend") throw new Error(`expected a friend card`);
  return card.line;
};

describe("friendCard estimate (ac-1)", () => {
  it("gives a calm-weather flight time for a 190 mile friend", () => {
    expect(lineFor(friend("theo", "Boston", 190), bird())).toBe(
      "Boston, 190 mi. About 4h 13m.",
    );
  });

  it("gives seconds for a friend a few blocks over", () => {
    expect(lineFor(friend("rosa", null, 0.2), bird())).toMatch(
      /^\d+ blocks? over\. About \d+ seconds?\.$/,
    );
  });

  it("counts barns for a trip that roosts overnight", () => {
    expect(lineFor(friend("dev", "Chicago", 713), bird())).toBe(
      "Chicago, 713 mi. Two days, one barn.",
    );
  });

  it("leaves random delays out of the estimate", () => {
    const shaky = bird({ focus: 1, belly: 10, feathers: 10, energy: 10 });
    const lines = Array.from({ length: 20 }, (_, i) =>
      lineFor(friend(`f${i}`, "Boston", 190), shaky),
    );
    expect(new Set(lines)).toEqual(new Set(["Boston, 190 mi. About 4h 13m."]));
  });

  it("does not call waiting for sunrise at home a barn", () => {
    expect(lineFor(friend("rosa", null, 0.2), bird(), NIGHT)).toMatch(
      /^\d+ blocks? over\. About \d+h \d\dm\.$/,
    );
  });

  it("shows only the distance when no bird is ready", () => {
    expect(lineFor(friend("theo", "Boston", 190), null)).toBe(
      "Boston, 190 mi.",
    );
  });

  it("uses the sender's units for the distance", () => {
    expect(lineFor(friend("theo", "Boston", 190), null, MORNING, "km")).toBe(
      "Boston, 306 km.",
    );
  });

  it("greys a friend with no loft yet", () => {
    expect(
      friendCard(friend("sam", null, null), {
        loft: NYC,
        bird: bird(),
        nowMs: MORNING,
        units: "mi",
      }),
    ).toEqual({
      kind: "unreachable",
      id: "sam",
      name: "sam",
      reason: "No loft yet.",
    });
  });

  it("greys everyone while the sender has no loft", () => {
    expect(
      friendCard(friend("theo", "Boston", 190), {
        loft: null,
        bird: bird(),
        nowMs: MORNING,
        units: "mi",
      }),
    ).toEqual({
      kind: "unreachable",
      id: "theo",
      name: "theo",
      reason: "Set your loft to send.",
    });
  });
});

describe("fastest ready bird", () => {
  const slow = bird({ speedMph: 30 });
  const fast = bird({ speedMph: 60 });
  const tiredFast = bird({ speedMph: 60, canFly: false });

  it("picks the fastest bird that can fly", () => {
    expect(fastestReady([slow, fast])).toBe(fast);
    expect(fastestReady([slow, tiredFast])).toBe(slow);
    expect(fastestReady([tiredFast])).toBeNull();
    expect(readyBirds([slow, tiredFast, fast])).toEqual([slow, fast]);
  });

  it("picks by flying speed after level", () => {
    const base54 = bird({ speedMph: 54 });
    const level10 = bird({ speedMph: 52, level: 10 });
    expect(fastestReady([base54, level10])).toBe(level10);
    expect(
      lineFor(friend("theo", "Boston", 190), fastestReady([base54, level10])),
    ).toBe("Boston, 190 mi. About 3h 21m.");
  });

  it("passes over a sulking bird for a slower fed one", () => {
    const sulking54 = bird({ speedMph: 54, sulking: true });
    const fed52 = bird({ speedMph: 52 });
    expect(fastestReady([sulking54, fed52])).toBe(fed52);
    expect(
      lineFor(friend("theo", "Boston", 190), fastestReady([sulking54, fed52])),
    ).toBe("Boston, 190 mi. About 3h 39m.");
  });

  it("changes the estimate when the fast bird cannot fly", () => {
    const theo = friend("theo", "Boston", 190);
    expect(lineFor(theo, fastestReady([slow, fast]))).not.toBe(
      lineFor(theo, fastestReady([slow, tiredFast])),
    );
  });
});

describe("runningLine", () => {
  it.each([
    [0, 2, "Pick who it's for. 2 birds are ready."],
    [0, 1, "Pick who it's for. 1 bird is ready."],
    [0, 0, "Everyone is asleep or eating. Feed someone, or wake a napper."],
    [1, 2, "1 picked. That takes 1 bird, and 2 are ready."],
    [2, 2, "2 picked. That takes 2 birds, and 2 are ready."],
    [3, 1, "3 picked. That takes 3 birds, and 1 is ready."],
    [1, 0, "1 picked. That takes 1 bird, and none are ready."],
  ])("%i picked with %i ready", (picked, ready, line) => {
    expect(runningLine(picked, ready)).toBe(line);
  });
});

describe("canGoNext", () => {
  it.each([
    [0, 2, false],
    [1, 2, true],
    [2, 2, true],
    [3, 2, false],
    [1, 0, false],
  ])("%i picked with %i ready is %s", (picked, ready, ok) => {
    expect(canGoNext(picked, ready)).toBe(ok);
  });
});

describe("nextHref", () => {
  it("carries every pick to Compose", () => {
    expect(nextHref(["a", "b c"])).toBe("/send/write?to=a&to=b+c");
  });
});

describe("sillCard (ac-1)", () => {
  it("names the owner and says their bird rides home free", () => {
    expect(
      sillCard({
        id: "v1",
        owner: { id: "u2", name: "Priya", handle: "priya" },
        bird: { name: "Dumpling" },
      }),
    ).toEqual({
      visitId: "v1",
      name: "Priya",
      line: "Dumpling is waiting. A reply rides home free.",
    });
  });
});

describe("matches", () => {
  it("matches names case-blind and ignores surrounding spaces", () => {
    expect(matches("Maya Okafor", " oKa ")).toBe(true);
    expect(matches("Maya Okafor", "")).toBe(true);
    expect(matches("Maya Okafor", "theo")).toBe(false);
  });
});

describe("contacts (ac-1)", () => {
  it("offers the picker only where navigator.contacts.select exists", () => {
    expect(canPickContacts({})).toBe(false);
    expect(canPickContacts({ contacts: {} })).toBe(false);
    expect(canPickContacts({ contacts: { select: async () => [] } })).toBe(
      true,
    );
  });

  it("asks for names only, several at once, and keeps the first non-blank name of each", async () => {
    const calls: unknown[] = [];
    const names = await pickContacts({
      contacts: {
        select: async (props: string[], opts: { multiple: boolean }) => {
          calls.push([props, opts]);
          return [
            { name: [" Maya Okafor "] },
            { name: [] },
            { name: ["Jordan Bell", "JB"] },
            {},
          ];
        },
      },
    });
    expect(calls).toEqual([[["name"], { multiple: true }]]);
    expect(names).toEqual(["Maya Okafor", "Jordan Bell"]);
  });

  it("picks nobody when the picker is cancelled or fails", async () => {
    const names = await pickContacts({
      contacts: {
        select: async () => {
          throw new Error("InvalidStateError");
        },
      },
    });
    expect(names).toEqual([]);
  });

  it("hands the name to NewRecipient in sessionStorage", () => {
    const store = new Map<string, string>();
    handOffName({ setItem: (k, v) => void store.set(k, v) }, "Maya Okafor");
    expect(PREFILL_NAME_KEY).toBe("coo:prefill-name");
    expect(store.get("coo:prefill-name")).toBe("Maya Okafor");
  });
});
