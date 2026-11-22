import { describe, expect, it, vi } from "vitest";
import type { SyncPayload } from "@/components/sync";
import {
  feedThenRefresh,
  flockRow,
  incomingCards,
  perchSlots,
  type FlightLite,
} from "./flockRows";

type Bird = SyncPayload["birds"][number];

const bird = (over: Partial<Bird> = {}): Bird =>
  ({
    id: "b1",
    name: "Gerald",
    look: "gerald",
    pronoun: "he",
    status: "home",
    hungry: false,
    tired: false,
    busyKind: null,
    busyUntil: null,
    gear: [],
    ...over,
  }) as Bird;

const tz = "America/New_York";
const now = Date.parse("2026-11-20T14:20:00Z");
const at = (iso: string) => Date.parse(iso);

const flight = (over: Partial<FlightLite> = {}): FlightLite => ({
  id: "f1",
  kind: "delivery",
  status: "flying",
  role: "mine",
  bird: { id: "b1", name: "Brenda" },
  owner: { id: "me", name: "Max" },
  counterpart: { id: "theo", name: "Theo" },
  to: { label: "Boston" },
  releaseAt: at("2026-11-20T19:30:00Z"),
  arriveAt: at("2026-11-20T20:05:00Z"),
  ...over,
});

const ctx = (flights: FlightLite[] = [], myVisiting: unknown[] = []) => ({
  timezone: tz,
  nowMs: now,
  flights,
  myVisiting: myVisiting as {
    birdId: string;
    hostName: string;
    leavesAt: number;
  }[],
});

describe("flockRow (ac-2)", () => {
  it("reads Ready for a fed bird at home", () => {
    expect(flockRow(bird(), ctx())).toEqual({
      action: { kind: "chip", chip: "Ready" },
      line: "Home, fed, smug",
      tone: "sky",
    });
  });

  it("offers Feed me for a hungry bird at home", () => {
    expect(flockRow(bird({ hungry: true }), ctx())).toEqual({
      action: { kind: "feed" },
      line: "Hungry. Has opinions about it.",
      tone: "peach",
    });
  });

  it("names the recipient, place and landing time of a flying bird", () => {
    expect(flockRow(bird({ status: "flying" }), ctx([flight()]))).toEqual({
      action: { kind: "chip", chip: "Flying" },
      line: "To Theo in Boston, lands 3:05 pm",
      tone: "sun",
    });
  });

  it("says a flying bird on its way back is heading home", () => {
    const row = flockRow(
      bird({ status: "flying" }),
      ctx([flight({ kind: "return" })]),
    );
    expect(row.line).toBe("Heading home, lands 3:05 pm");
  });

  it("keeps a flying bird with no flight row on Flying", () => {
    expect(flockRow(bird({ status: "flying" }), ctx())).toMatchObject({
      action: { kind: "chip", chip: "Flying" },
      line: "Out on a delivery",
    });
  });

  it("shows a hungry flying bird as Flying, not Feed me", () => {
    expect(
      flockRow(bird({ status: "flying", hungry: true }), ctx()).action,
    ).toEqual({ kind: "chip", chip: "Flying" });
  });

  it("says when a scheduled bird leaves", () => {
    const row = flockRow(
      bird({ status: "scheduled" }),
      ctx([flight({ status: "scheduled" })]),
    );
    expect(row).toMatchObject({
      action: { kind: "chip", chip: "Scheduled" },
      line: "Leaves at 2:30 pm for Theo",
    });
  });

  it("says whose sill a visiting bird sits on", () => {
    const row = flockRow(
      bird({ status: "visiting" }),
      ctx(
        [],
        [
          {
            birdId: "b1",
            hostName: "Priya",
            leavesAt: at("2026-11-20T21:00:00Z"),
          },
        ],
      ),
    );
    expect(row).toMatchObject({
      action: { kind: "chip", chip: "On a sill" },
      line: "On Priya's sill until 4:00 pm",
      tone: "mint",
    });
  });

  it.each([
    ["nap", "Napping until 2:40 pm"],
    ["bath", "Bathing until 2:40 pm"],
  ])("rests a bird busy with a %s", (busyKind, line) => {
    const row = flockRow(
      bird({ status: "busy", busyKind, busyUntil: at("2026-11-20T19:40:00Z") }),
      ctx(),
    );
    expect(row).toEqual({
      action: { kind: "chip", chip: "Resting" },
      line,
      tone: "lilac",
    });
  });

  it.each([
    ["with", at("2026-11-20T19:40:00Z"), "On an odd job until 2:40 pm"],
    ["without", null, "On an odd job"],
  ])(
    "chips a bird on an odd job %s an end time On a job",
    (_, busyUntil, line) => {
      expect(
        flockRow(bird({ status: "busy", busyKind: "job", busyUntil }), ctx()),
      ).toEqual({
        action: { kind: "chip", chip: "On a job" },
        line,
        tone: "sun",
      });
    },
  );

  it("keeps a tired bird that can still fly Ready", () => {
    expect(flockRow(bird({ tired: true, canFly: true }), ctx())).toMatchObject({
      action: { kind: "chip", chip: "Ready" },
      line: "Home and a bit tired. Can still fly.",
    });
  });

  it.each([
    ["tired", "Too tired to fly. Resting up."],
    ["busy", "Busy for now. Can't fly yet."],
    ["away", "Away from the loft"],
  ] as const)("rests a home bird the server grounds as %s", (reason, line) => {
    expect(
      flockRow(
        bird({ tired: true, canFly: false, cannotFlyReason: reason }),
        ctx(),
      ),
    ).toEqual({
      action: { kind: "chip", chip: "Resting" },
      line,
      tone: "lilac",
    });
  });
});

describe("perchSlots", () => {
  const ready = { status: "ready" };

  it("leaves one empty slot per free perch (ac-3)", () => {
    expect(perchSlots(4, 5, null)).toEqual(["empty"]);
    expect(perchSlots(2, 4, { status: "incubating" })).toEqual([
      "empty",
      "empty",
    ]);
  });

  it("puts a ready egg in the first empty slot only (ac-3)", () => {
    expect(perchSlots(2, 5, ready)).toEqual(["egg", "empty", "empty"]);
  });

  it("has no slots when every perch is taken (ac-3)", () => {
    expect(perchSlots(5, 5, ready)).toEqual([]);
  });

  it("puts an owed roommate in the first empty slot (ac-4)", () => {
    expect(perchSlots(1, 3, null)).toEqual(["roommate", "empty"]);
    expect(perchSlots(1, 3, { status: "incubating" })).toEqual([
      "roommate",
      "empty",
    ]);
  });

  it("gives a ready egg the slot after the roommate (ac-4)", () => {
    expect(perchSlots(1, 3, ready)).toEqual(["roommate", "egg"]);
    expect(perchSlots(1, 4, ready)).toEqual(["roommate", "egg", "empty"]);
    expect(perchSlots(1, 2, ready)).toEqual(["roommate"]);
  });

  it("never offers a roommate to a loft with no birds or two or more (ac-4)", () => {
    expect(perchSlots(0, 3, null)).not.toContain("roommate");
    expect(perchSlots(2, 5, null)).not.toContain("roommate");
    expect(perchSlots(4, 5, ready)).not.toContain("roommate");
  });
});

describe("incomingCards (ac-3)", () => {
  it("makes one card per flight flying to me, and none for my own", () => {
    const cards = incomingCards(
      [
        flight({
          id: "in1",
          role: "incoming",
          owner: { id: "priya", name: "Priya" },
          bird: { id: "x", name: "Dumpling" },
          arriveAt: now + 12 * 60_000,
        }),
        flight({ id: "in2", role: "incoming", status: "scheduled" }),
        flight({ id: "in3", role: "incoming", status: "landed" }),
        flight({ id: "mine" }),
      ],
      now,
    );
    expect(cards).toEqual([
      {
        id: "in1",
        title: "Incoming from Priya",
        line: "Dumpling lands on your sill in 12 min",
      },
    ]);
  });

  it("makes a card for a delivery flying to me", () => {
    expect(
      incomingCards([flight({ role: "incoming", kind: "delivery" })], now),
    ).toHaveLength(1);
  });

  it("makes no card for a return leaving my sill", () => {
    expect(
      incomingCards([flight({ role: "incoming", kind: "return" })], now),
    ).toEqual([]);
  });

  it("makes no card for my own bird heading home", () => {
    expect(
      incomingCards([flight({ role: "mine", kind: "return" })], now),
    ).toEqual([]);
  });
});

describe("feedThenRefresh (ac-2)", () => {
  it("feeds the bird, then refetches", async () => {
    const calls: string[] = [];
    const feed = vi.fn(async (id: string) => {
      calls.push(`feed ${id}`);
    });
    await feedThenRefresh(
      "b1",
      feed,
      () => calls.push("refresh"),
      (message) => calls.push(`toast ${message}`),
    );
    expect(calls).toEqual(["feed b1", "refresh"]);
  });

  it("toasts a failed feed and still refetches", async () => {
    const calls: string[] = [];
    await feedThenRefresh(
      "b1",
      async () => {
        throw new Error("Not enough seeds.");
      },
      () => calls.push("refresh"),
      (message) => calls.push(`toast ${message}`),
    );
    expect(calls).toEqual(["toast Not enough seeds.", "refresh"]);
  });
});
