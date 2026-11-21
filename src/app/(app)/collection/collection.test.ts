import { describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { Collection } from "@/server/services/collection";
import {
  badgesView,
  birdsView,
  loadCollection,
  openCollection,
} from "./collection";

type Badge = Collection["badges"][number];
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
  it("hands back the badges and birds views when the load succeeds", async () => {
    const result = await openCollection(() =>
      loadCollection(async () => json(200, collection(MOCK))),
    );
    expect(result).toEqual({
      ok: true,
      view: { badges: badgesView(MOCK), birds: birdsView(11, RECENT) },
    });
  });

  it("passes the API's message through when the load is refused", async () => {
    const result = await openCollection(() =>
      loadCollection(async () =>
        json(401, {
          error: { code: "unauthorized", message: "Sign in first." },
        }),
      ),
    );
    expect(result).toEqual({ ok: false, message: "Sign in first." });
  });

  it("falls back to the post office line when the network fails", async () => {
    const offline = async () => {
      throw new TypeError("offline");
    };
    await expect(
      openCollection(() => loadCollection(offline)),
    ).resolves.toEqual({
      ok: false,
      message: "We could not reach the post office. Try again.",
    });
    await expect(
      openCollection(() =>
        loadCollection(async () => new Response("<html>", { status: 502 })),
      ),
    ).resolves.toEqual({
      ok: false,
      message: "We could not reach the post office. Try again.",
    });
  });
});
