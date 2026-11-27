import { describe, expect, it, vi } from "vitest";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import {
  describeLoft,
  feedThenRefresh,
  flockRow,
  incomingCards,
  loftRooms,
  perchSlots,
  ROOM_LINK,
  type FlightLite,
  type Room,
} from "./flockRows";
import type { LoftTime } from "./loftTime";

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

const CLOCK = /\d{1,2}:\d{2}\s?(am|pm)/i;
const COUNTDOWN = /\d+ (min|sec)|\d+h \d{2}m/;

const ctx = (
  flights: FlightLite[] = [],
  myVisiting: unknown[] = [],
  nowMs = now,
) => ({
  timezone: tz,
  nowMs,
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

  it("names the recipient, place and time of day a flying bird lands", () => {
    const row = flockRow(bird({ status: "flying" }), ctx([flight()]));
    expect(row).toEqual({
      action: { kind: "chip", chip: "Flying" },
      line: "To Theo in Boston, lands this afternoon",
      tone: "sun",
    });
    expect(row.line).not.toMatch(CLOCK);
    expect(row.line).not.toContain("3:05 pm");
  });

  it.each([
    [
      "2026-11-20T06:00:00-05:00",
      "2026-11-20T07:11:00-05:00",
      "early this morning",
    ],
    ["2026-11-20T06:00:00-05:00", "2026-11-20T09:00:00-05:00", "this morning"],
    [
      "2026-11-20T07:05:00-05:00",
      "2026-11-20T07:11:00-05:00",
      "any minute now",
    ],
  ])("seen at %s, a bird landing at %s lands %j", (seen, lands, phrase) => {
    const row = flockRow(
      bird({ status: "flying" }),
      ctx(
        [
          flight({
            counterpart: { id: "ethan", name: "Ethan" },
            to: { label: "Tudor City" },
            arriveAt: at(lands),
          }),
        ],
        [],
        at(seen),
      ),
    );
    expect(row.line).toBe(`To Ethan in Tudor City, lands ${phrase}`);
    expect(row.line).not.toMatch(CLOCK);
    expect(row.line).not.toMatch(COUNTDOWN);
  });

  it("says a flying bird on its way back is heading home", () => {
    const row = flockRow(
      bird({ status: "flying" }),
      ctx([flight({ kind: "return" })]),
    );
    expect(row.line).toBe("Heading home, lands this afternoon");
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
      line: "Leaves this afternoon for Theo",
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
      line: "On Priya's sill until this afternoon",
      tone: "mint",
    });
  });

  it.each([
    ["nap", "Napping until this afternoon"],
    ["bath", "Bathing until this afternoon"],
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
    ["with", at("2026-11-20T19:40:00Z"), "On an odd job until this afternoon"],
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
    expect(perchSlots(2, 4, null)).toEqual(["empty", "empty"]);
  });

  it("puts an incubating egg in a nest after the roommate and before empty", () => {
    expect(perchSlots(2, 4, { status: "incubating" })).toEqual([
      "nest",
      "empty",
    ]);
    expect(perchSlots(1, 4, { status: "incubating" })).toEqual([
      "roommate",
      "nest",
      "empty",
    ]);
    expect(perchSlots(1, 2, { status: "incubating" })).toEqual(["roommate"]);
    expect(perchSlots(2, 4, ready)).toEqual(["egg", "empty"]);
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
      "nest",
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

describe("loftRooms", () => {
  const kinds = (rooms: Room[]) => rooms.map((r) => r.kind);

  it("gives each bird its room in flock order, then the free rooms", () => {
    const awake = bird({ id: "a", name: "Gerald" });
    const tired = bird({ id: "t", name: "Kevin", tired: true });
    const napping = bird({
      id: "n",
      name: "Pip",
      status: "busy",
      busyKind: "nap",
    });
    expect(loftRooms([awake, tired, napping], 5, null)).toEqual([
      { kind: "home", bird: awake, asleep: false },
      { kind: "home", bird: tired, asleep: true },
      { kind: "home", bird: napping, asleep: true },
      { kind: "empty" },
      { kind: "empty" },
    ]);
  });

  it("sends flying, visiting and odd-job birds out and keeps other busy birds awake at home", () => {
    const flying = bird({ id: "f", status: "flying" });
    const visiting = bird({ id: "v", status: "visiting" });
    const onJob = bird({ id: "j", status: "busy", busyKind: "job" });
    const bathing = bird({ id: "b", status: "busy", busyKind: "bath" });
    const scheduled = bird({ id: "s", status: "scheduled" });
    expect(
      loftRooms([flying, visiting, onJob, bathing, scheduled], 5, null),
    ).toEqual([
      { kind: "away", bird: flying },
      { kind: "away", bird: visiting },
      { kind: "away", bird: onJob },
      { kind: "home", bird: bathing, asleep: false },
      { kind: "home", bird: scheduled, asleep: false },
    ]);
  });

  it("sends a tired odd-job bird out and puts tired busy birds to sleep", () => {
    const onJob = bird({
      id: "j",
      status: "busy",
      busyKind: "job",
      tired: true,
    });
    const bathing = bird({
      id: "b",
      status: "busy",
      busyKind: "bath",
      tired: true,
    });
    const scheduled = bird({ id: "s", status: "scheduled", tired: true });
    expect(loftRooms([onJob, bathing, scheduled], 3, null)).toEqual([
      { kind: "away", bird: onJob },
      { kind: "home", bird: bathing, asleep: true },
      { kind: "home", bird: scheduled, asleep: true },
    ]);
  });

  it("fills free rooms with the roommate, then the egg, then empty", () => {
    const one = [bird()];
    expect(kinds(loftRooms(one, 3, { status: "ready" }))).toEqual([
      "home",
      "roommate",
      "egg",
    ]);
    expect(loftRooms(one, 3, { status: "incubating" }).slice(1)).toEqual([
      { kind: "roommate" },
      { kind: "egg", ready: false },
    ]);
    expect(
      loftRooms([bird(), bird({ id: "b2" })], 3, { status: "ready" })[2],
    ).toEqual({ kind: "egg", ready: true });
  });

  it("builds room 5 as to let only with 4 perches", () => {
    expect(kinds(loftRooms([bird()], 3, null))).toHaveLength(3);
    expect(kinds(loftRooms([bird(), bird({ id: "b2" })], 4, null))).toEqual([
      "home",
      "home",
      "empty",
      "empty",
      "tolet",
    ]);
    expect(kinds(loftRooms([bird()], 5, null))).not.toContain("tolet");
  });
});

describe("ROOM_LINK", () => {
  const link = (room: Room) => ROOM_LINK[room.kind](room as never);
  const gerald = bird({ id: "g1", name: "Gerald" });

  it("maps each room to its docs/17 route and accessible name", () => {
    expect(link({ kind: "home", bird: gerald, asleep: false })).toEqual({
      href: "/birds/g1",
      label: "Gerald, at home",
    });
    expect(link({ kind: "home", bird: gerald, asleep: true })).toEqual({
      href: "/birds/g1",
      label: "Gerald, asleep",
    });
    expect(link({ kind: "away", bird: gerald })).toEqual({
      href: "/birds/g1",
      label: "Gerald, out",
    });
    expect(link({ kind: "roommate" })).toEqual({
      href: "/aviary/roommate",
      label: "A roommate is waiting",
    });
    expect(link({ kind: "egg", ready: true })).toEqual({
      href: "/aviary",
      label: "An egg is ready",
    });
    expect(link({ kind: "egg", ready: false })).toEqual({
      href: "/aviary",
      label: "An egg in its nest",
    });
    expect(link({ kind: "empty" })).toBeNull();
    expect(link({ kind: "tolet" })).toEqual({
      href: "/shop",
      label: "Room to let. Open the shop",
    });
  });
});

describe("describeLoft", () => {
  const home = (name: string): Room => ({
    kind: "home",
    bird: bird({ name }),
    asleep: false,
  });
  const asleep = (name: string): Room => ({
    kind: "home",
    bird: bird({ name, tired: true }),
    asleep: true,
  });
  const away = (name: string): Room => ({
    kind: "away",
    bird: bird({ name, status: "flying" }),
  });

  it("says who is home, asleep and out, and what is free or to let", () => {
    expect(
      describeLoft(
        [
          home("Gerald"),
          asleep("Kevin"),
          away("Brenda"),
          { kind: "empty" },
          { kind: "tolet" },
        ],
        "day",
      ),
    ).toBe(
      "Day on your rooftop loft. Gerald sits at home. Kevin is asleep. Brenda is out. One room is free. One room is to let.",
    );
  });

  it("names several birds in one sentence and counts free rooms", () => {
    expect(
      describeLoft(
        [
          home("Gerald"),
          home("Pip"),
          home("Dot"),
          asleep("Kevin"),
          asleep("Moss"),
          away("Brenda"),
          away("Fig"),
          { kind: "empty" },
          { kind: "empty" },
        ],
        "day",
      ),
    ).toBe(
      "Day on your rooftop loft. Gerald, Pip and Dot sit at home. Kevin and Moss are asleep. Brenda and Fig are out. Two rooms are free.",
    );
  });

  it("leaves out sentences with nobody in them", () => {
    expect(describeLoft([{ kind: "empty" }], "day")).toBe(
      "Day on your rooftop loft. One room is free.",
    );
    expect(describeLoft([away("Brenda"), { kind: "roommate" }], "day")).toBe(
      "Day on your rooftop loft. Brenda is out.",
    );
  });

  it.each(config.loft.times.order as LoftTime[])(
    "opens with the time of day at %s",
    (time) => {
      const opening = `${time[0].toUpperCase()}${time.slice(1)} on your rooftop loft.`;
      expect(describeLoft([home("Gerald")], time)).toBe(
        `${opening} Gerald sits at home.`,
      );
    },
  );
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
      tz,
    );
    expect(cards).toEqual([
      {
        id: "in1",
        title: "Incoming from Priya",
        line: "Dumpling lands on your sill this morning",
      },
    ]);
    expect(cards[0].line).not.toMatch(COUNTDOWN);
  });

  it("says a bird ten minutes out lands any minute now", () => {
    const [card] = incomingCards(
      [flight({ role: "incoming", arriveAt: now + 10 * 60_000 })],
      now,
      tz,
    );
    expect(card.line).toBe("Brenda lands on your sill any minute now");
  });

  it("makes a card for a delivery flying to me", () => {
    expect(
      incomingCards([flight({ role: "incoming", kind: "delivery" })], now, tz),
    ).toHaveLength(1);
  });

  it("makes no card for a return leaving my sill", () => {
    expect(
      incomingCards([flight({ role: "incoming", kind: "return" })], now, tz),
    ).toEqual([]);
  });

  it("makes no card for my own bird heading home", () => {
    expect(
      incomingCards([flight({ role: "mine", kind: "return" })], now, tz),
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
