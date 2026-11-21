import { describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { Collection } from "@/server/services/collection";
import { badgesView, loadCollection, openCollection } from "./collection";

type Badge = Collection["badges"][number];

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

const collection = (list: Badge[]): Collection => ({
  postmarks: [],
  badges: list,
  birdsMet: 0,
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
  it("hands back the badges view when the load succeeds", async () => {
    const result = await openCollection(() =>
      loadCollection(async () => json(200, collection(MOCK))),
    );
    expect(result).toEqual({ ok: true, view: badgesView(MOCK) });
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
