import { describe, expect, it } from "vitest";
import type { FriendRow } from "@/server/services/friends";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import { counter, replyModel } from "./replyModel";

const MIN = 60_000;
const NOW = Date.parse("2026-11-20T19:00:00Z");

const visit = (over: Partial<SyncVisit["bird"]> = {}): SyncVisit => ({
  id: "v1",
  bird: {
    id: "b1",
    name: "Dumpling",
    breed: "city",
    look: "dumpling",
    pronoun: "she",
    speedMph: 43,
    gear: [],
    ...over,
  },
  owner: { id: "u1", name: "Priya", handle: "priya" },
  note: {
    id: "n1",
    body: "Saturday works. Bring the bread.",
    doodle: null,
    createdAt: 0,
  },
  arrivedAt: NOW - 2 * MIN,
  leavesAt: NOW + 28 * MIN,
  status: "waiting",
  snackGiven: false,
  returnMi: 81,
  flight: { distanceMi: 80, durationMs: 112 * MIN, delayKind: "none" },
});

const PRIYA = {
  id: "u1",
  name: "Priya",
  handle: "priya",
  shows: "city",
  theyShow: "city",
  where: "Philadelphia, PA",
  distanceMi: 81,
} as FriendRow;

describe("replyModel (ac-1)", () => {
  it("reads like the mock for Priya's Dumpling", () => {
    expect(replyModel(visit(), PRIYA, NOW, "mi")).toEqual({
      title: "Reply to Priya",
      heading: "Dumpling flies home to Priya",
      route: "Philadelphia, 81 miles. About 1h 53m at her pace.",
      speed: "43 mph",
      wroteLabel: "Priya wrote",
      note: "Saturday works. Bring the bread.",
      limit: 140,
      wait: "She waits 28 more minutes, then heads home with or without a reply.",
      release: "Send Dumpling home",
      composeHref: "/send/write?to=u1",
    });
  });

  it("estimates with the visiting bird's own speed", () => {
    const slow = replyModel(visit({ speedMph: 27 }), PRIYA, NOW, "mi");
    expect(slow.route).toBe(
      "Philadelphia, 81 miles. About 3h 00m at her pace.",
    );
    expect(slow.speed).toBe("27 mph");
  });

  it("counts against the visiting bird's limit from breed and gear", () => {
    expect(replyModel(visit({ gear: ["tube"] }), PRIYA, NOW, "mi").limit).toBe(
      280,
    );
    expect(replyModel(visit({ breed: "pouter" }), PRIYA, NOW, "mi").limit).toBe(
      280,
    );
  });

  it("drops the city when the friend does not share it", () => {
    const hidden = { ...PRIYA, theyShow: "block" } as FriendRow;
    expect(replyModel(visit(), hidden, NOW, "mi").route).toBe(
      "81 miles. About 1h 53m at her pace.",
    );
  });

  it("estimates the return leg from where the bird waits, not the host's loft now", () => {
    const waiting = { ...visit({ pronoun: "they" }), returnMi: 80.56 };
    const newYork = { ...PRIYA, where: "New York, NY", distanceMi: 2446 };
    expect(replyModel(waiting, newYork, NOW, "mi").route).toBe(
      "New York, 81 miles. About 1h 52m at their pace.",
    );
    expect(replyModel(waiting, undefined, NOW, "mi").route).toBe(
      "81 miles. About 1h 52m at their pace.",
    );
  });

  it("uses the user's units for distance", () => {
    expect(replyModel(visit(), PRIYA, NOW, "km").route).toBe(
      "Philadelphia, 130 kilometres. About 1h 53m at her pace.",
    );
  });

  it("fills the bird's pronoun", () => {
    const they = replyModel(visit({ pronoun: "they" }), PRIYA, NOW, "mi");
    expect(they.route).toBe(
      "Philadelphia, 81 miles. About 1h 53m at their pace.",
    );
    expect(they.wait).toBe(
      "They wait 28 more minutes, then head home with or without a reply.",
    );
    const he = replyModel(visit({ pronoun: "he" }), PRIYA, NOW, "mi");
    expect(he.wait).toMatch(/^He waits 28 more minutes, then heads home/);
  });

  it("counts the wait down in whole minutes, never below one", () => {
    expect(replyModel(visit(), PRIYA, NOW + 27.5 * MIN, "mi").wait).toMatch(
      /^She waits 1 more minute, then/,
    );
    expect(replyModel(visit(), PRIYA, NOW + 10 * MIN + 1, "mi").wait).toMatch(
      /^She waits 18 more minutes/,
    );
  });

  it("leaves the estimate out when no distance is known", () => {
    const v = { ...visit(), returnMi: null };
    expect(replyModel(v, PRIYA, NOW, "mi").route).toBe("Philadelphia.");
    expect(replyModel(v, undefined, NOW, "mi").route).toBe("");
  });
});

describe("counter (ac-1)", () => {
  it("counts like the server, trimmed and by code point", () => {
    expect(
      counter("Bread is secured. Tell Dumpling the tuna was not for her.", 140),
    ).toEqual({ label: "57 of 140 characters", over: false });
    expect(counter("  hi 🐦  ", 140).label).toBe("4 of 140 characters");
  });

  it("goes over past the limit, not at it", () => {
    expect(counter("a".repeat(140), 140).over).toBe(false);
    expect(counter("a".repeat(141), 140)).toEqual({
      label: "141 of 140 characters",
      over: true,
    });
  });
});
