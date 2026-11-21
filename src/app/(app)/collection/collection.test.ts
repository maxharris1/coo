import { describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { Collection } from "@/server/services/collection";
import {
  badgesView,
  birdsView,
  loadCollection,
  openCollection,
  postmarksView,
} from "./collection";

type Badge = Collection["badges"][number];
type Earned = Collection["postmarks"][number];
type Met = Collection["birdsMetRecent"][number];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const badges = (
  state: Partial<Record<string, { progress?: number; earned?: boolean }>>,
): Badge[] =>
  config.badges.badges.map((b) => ({
    id: b.id,
    name: b.name,
    text: b.text,
    icon: b.icon,
    goal: b.goal,
    progress: state[b.id]?.progress ?? (state[b.id]?.earned ? b.goal : 0),
    earnedAt: state[b.id]?.earned ? 1_700_000_000_000 : null,
  }));

const MOCK = badges({
  "first-flight": { earned: true },
  "night-owl": { earned: true },
  "rfc-1149": { progress: 4 },
});

const met = (name: string, look = "gerald", gear: string[] = []): Met => ({
  name,
  look,
  breed: "city",
  gear,
});

const RECENT = [
  met("Kevin", "kevin"),
  met("Pip", "dumpling", ["scarf"]),
  met("Lou", "admiral"),
  met("Biscuit", "fantail"),
  met("Gerald"),
];

const collection = (list: Badge[]): Collection => ({
  account: "account-a",
  postmarks: [],
  badges: list,
  birdsMet: 11,
  birdsMetRecent: RECENT,
});

describe("badgesView", () => {
  it("counts earned badges out of every badge sent", () => {
    expect(badgesView(MOCK).count).toBe("2 of 12");
    expect(badgesView(MOCK.slice(0, 3)).count).toBe("2 of 3");
    expect(badgesView([]).count).toBe("0 of 0");
  });

  it("puts earned badges first and keeps config order inside each group", () => {
    const view = badgesView(
      badges({ "night-owl": { earned: true }, century: { earned: true } }),
    );
    expect(view.cards.map((c) => c.id)).toEqual([
      "night-owl",
      "century",
      ...config.badges.badges
        .map((b) => b.id)
        .filter((id) => id !== "night-owl" && id !== "century"),
    ]);
    expect(view.cards.map((c) => c.earned).slice(0, 3)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("shows progress only on unearned badges with a goal above one", () => {
    const cards = badgesView(MOCK).cards;
    const line = (id: string) => cards.find((c) => c.id === id)?.line;
    expect(line("rfc-1149")).toBe("Replies on the same bird: 4 of 9");
    expect(line("cher-ami")).toBe("Deliver through a storm");
    expect(line("first-flight")).toBe("Your first note landed");

    const earned = badgesView(badges({ "rfc-1149": { earned: true } })).cards;
    expect(earned[0]).toMatchObject({
      id: "rfc-1149",
      line: "Replies on the same bird",
      earned: true,
    });
  });

  it("tints each badge by its config position, not its display position", () => {
    const tints = (list: Badge[]) =>
      Object.fromEntries(badgesView(list).cards.map((c) => [c.id, c.tint]));
    expect(tints(MOCK)).toMatchObject({
      "first-flight": "sun",
      "night-owl": "lilac",
      "cher-ami": "sky",
      "rfc-1149": "mint",
      "around-the-block": "sun",
    });
    expect(tints(badges({ "rfc-1149": { earned: true } }))["rfc-1149"]).toBe(
      "mint",
    );
  });

  it("carries name and icon through to the card", () => {
    expect(badgesView(MOCK).cards[0]).toEqual({
      id: "first-flight",
      name: "First flight",
      line: "Your first note landed",
      icon: "feather",
      tint: "sun",
      earned: true,
    });
  });
});

const TZ = "America/New_York";
const at = (iso: string) => Date.parse(iso);
const place = (
  city: string,
  region: string | null,
  earnedAt: number,
): Earned => ({ city, region, country: "US", earnedAt });

const MOCK_POSTMARKS = [
  place("Philadelphia", "PA", at("2026-11-19T15:00:00Z")),
  place("Boston", "MA", at("2026-11-12T15:00:00Z")),
  place("Hoboken", "NJ", at("2026-11-09T15:00:00Z")),
  place("Chicago", "IL", at("2026-11-02T15:00:00Z")),
];

const many = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    place(`Town ${i}`, null, at("2026-01-01T00:00:00Z") + i),
  );

const kinds = (n: number) =>
  postmarksView(many(n), null, TZ).slots.reduce(
    (acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

describe("postmarksView", () => {
  it("counts cities out of the slot total in config/game.json", () => {
    expect(config.game.postmarkSlots).toBe(50);
    expect(postmarksView(MOCK_POSTMARKS, null, TZ).count).toBe(
      "4 of 50 cities",
    );
    expect(postmarksView([], null, TZ).count).toBe("0 of 50 cities");
  });

  it("pads the stamps to a full row of four plus one empty row", () => {
    expect(kinds(0)).toEqual({ empty: 4 });
    expect(kinds(4)).toEqual({ stamp: 4, empty: 4 });
    expect(kinds(5)).toEqual({ stamp: 5, empty: 7 });
    expect(kinds(47)).toEqual({ stamp: 47, empty: 3 });
    expect(kinds(48)).toEqual({ stamp: 48, empty: 2 });
    expect(kinds(50)).toEqual({ stamp: 50 });
    expect(kinds(53)).toEqual({ stamp: 53 });
  });

  it("puts every stamp before the empty slots", () => {
    const slots = postmarksView(many(5), null, TZ).slots.map((s) => s.kind);
    expect(slots.lastIndexOf("stamp")).toBeLessThan(slots.indexOf("empty"));
  });

  it("stamps the date and the short place in capitals, as drawn", () => {
    const stamps = postmarksView(MOCK_POSTMARKS, null, TZ).slots.filter(
      (s) => s.kind === "stamp",
    );
    expect(stamps.map((s) => [s.date, s.place, s.long])).toEqual([
      ["NOV 19", "PHILA, PA", false],
      ["NOV 12", "BOSTON, MA", true],
      ["NOV 9", "HOBOKEN, NJ", true],
      ["NOV 2", "CHICAGO, IL", true],
    ]);
    expect(stamps[0].label).toBe("Postmark from Philadelphia, PA, November 19");
  });

  it("dates the stamp in the viewer's time zone", () => {
    const late = [place("Chicago", "IL", at("2026-11-20T03:00:00Z"))];
    const date = (tz: string) => {
      const [slot] = postmarksView(late, null, tz).slots;
      return slot.kind === "stamp" ? slot.date : null;
    };
    expect(date("America/Chicago")).toBe("NOV 19");
    expect(date("Europe/London")).toBe("NOV 20");
  });

  it("leaves the place off when the city has no region", () => {
    const [slot] = postmarksView([place("Paris", null, 1)], null, TZ).slots;
    expect(slot).toMatchObject({
      place: "PARIS",
      label: expect.stringMatching(/^Postmark from Paris, /),
    });
  });

  it("marks only postmarks earned after the last visit as fresh", () => {
    const seen = at("2026-11-10T00:00:00Z");
    const view = postmarksView(MOCK_POSTMARKS, seen, TZ);
    expect(
      view.slots.flatMap((s) => (s.kind === "stamp" ? [s.fresh] : [])),
    ).toEqual([true, true, false, false]);
    expect(view.seen).toBe(at("2026-11-19T15:00:00Z"));
  });

  it("animates nothing on a first visit and remembers the newest stamp", () => {
    const view = postmarksView(MOCK_POSTMARKS, null, TZ);
    expect(view.slots.some((s) => s.kind === "stamp" && s.fresh)).toBe(false);
    expect(view.seen).toBe(at("2026-11-19T15:00:00Z"));
  });

  it("starts the clock at zero with no postmarks, so the first one animates", () => {
    expect(postmarksView([], null, TZ).seen).toBe(0);
    const [slot] = postmarksView(MOCK_POSTMARKS.slice(0, 1), 0, TZ).slots;
    expect(slot).toMatchObject({ kind: "stamp", fresh: true });
  });

  it("never moves the seen mark backwards", () => {
    const later = at("2026-12-01T00:00:00Z");
    expect(postmarksView(MOCK_POSTMARKS, later, TZ).seen).toBe(later);
  });
});

describe("birdsView", () => {
  it("counts every bird met without a denominator", () => {
    expect(birdsView(11, RECENT).count).toBe("11 met");
    expect(birdsView(0, []).count).toBe("0 met");
  });

  it("shows the recent birds in order, tinted sky, sun, lilac, peach, mint", () => {
    expect(birdsView(11, RECENT).shown).toEqual([
      { name: "Kevin", look: "kevin", breed: "city", gear: [], tone: "sky" },
      {
        name: "Pip",
        look: "dumpling",
        breed: "city",
        gear: ["scarf"],
        tone: "sun",
      },
      { name: "Lou", look: "admiral", breed: "city", gear: [], tone: "lilac" },
      {
        name: "Biscuit",
        look: "fantail",
        breed: "city",
        gear: [],
        tone: "peach",
      },
      { name: "Gerald", look: "gerald", breed: "city", gear: [], tone: "mint" },
    ]);
  });

  it("counts the birds met beyond the ones shown", () => {
    expect(birdsView(11, RECENT).more).toBe(6);
    expect(birdsView(5, RECENT).more).toBe(0);
    expect(birdsView(2, RECENT.slice(0, 2)).more).toBe(0);
    expect(birdsView(0, [])).toEqual({ shown: [], more: 0, count: "0 met" });
  });
});

describe("loadCollection", () => {
  it("reads GET /api/collection", async () => {
    const body = collection(MOCK);
    const fetchImpl = vi.fn(async () => json(200, body));
    await expect(loadCollection(fetchImpl)).resolves.toEqual({
      ok: true,
      data: body,
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/collection");
  });
});

describe("openCollection", () => {
  it("hands back the postmarks, badges and birds views when the load succeeds", async () => {
    const body = { ...collection(MOCK), postmarks: MOCK_POSTMARKS };
    const seen = at("2026-11-10T00:00:00Z");
    const asked: string[] = [];
    const result = await openCollection(
      () => loadCollection(async () => json(200, body)),
      (account) => {
        asked.push(account);
        return seen;
      },
      TZ,
    );
    expect(asked).toEqual(["account-a"]);
    expect(result).toEqual({
      ok: true,
      account: "account-a",
      view: {
        postmarks: postmarksView(MOCK_POSTMARKS, seen, TZ),
        badges: badgesView(MOCK),
        birds: birdsView(11, RECENT),
      },
    });
  });

  it("passes the API's message through when the load is refused", async () => {
    const result = await openCollection(
      () =>
        loadCollection(async () =>
          json(401, {
            error: { code: "unauthorized", message: "Sign in first." },
          }),
        ),
      () => null,
      TZ,
    );
    expect(result).toEqual({ ok: false, message: "Sign in first." });
  });

  it("falls back to the post office line when the network fails", async () => {
    const offline = async () => {
      throw new TypeError("offline");
    };
    await expect(
      openCollection(
        () => loadCollection(offline),
        () => null,
        TZ,
      ),
    ).resolves.toEqual({
      ok: false,
      message: "We could not reach the post office. Try again.",
    });
    await expect(
      openCollection(
        () =>
          loadCollection(async () => new Response("<html>", { status: 502 })),
        () => null,
        TZ,
      ),
    ).resolves.toEqual({
      ok: false,
      message: "We could not reach the post office. Try again.",
    });
  });
});
