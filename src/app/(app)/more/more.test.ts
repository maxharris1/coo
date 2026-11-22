import { describe, expect, it, vi } from "vitest";
import type { LocalDate } from "@/lib/game/time";
import {
  MORE_ROWS,
  loadMoreSources,
  type MoreSources,
  type MoreSync,
} from "./more";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const SYNC: MoreSync = {
  friendsCount: 4,
  egg: { status: "incubating", deliveriesToGo: 6 },
  punchCard: {
    weekStart: "2026-11-16" as LocalDate,
    deliveries: 6,
    size: 10,
    paid: false,
  },
  me: { settings: { quietOn: true } },
};

const postmark = (city: string) => ({
  city,
  region: null,
  country: null,
  earnedAt: 1,
});
const badge = (id: string, earnedAt: number | null) => ({
  id,
  name: id,
  text: "",
  icon: "",
  goal: 1,
  progress: earnedAt === null ? 0 : 1,
  earnedAt,
});

type Bodies = Record<string, () => Response | Promise<Response>>;

const MOCK_BODIES: Bodies = {
  "/api/friends": () =>
    json(200, {
      friends: [],
      guestLinks: [{ id: "g1", name: "Maya", where: "Leeds" }],
    }),
  "/api/notes": () => json(200, { notes: [], nextCursor: null, total: 23 }),
  "/api/collection": () =>
    json(200, {
      account: "Since Nov 2026",
      postmarks: ["Leeds", "York", "Hull", "Bath"].map(postmark),
      badges: [badge("a", 1), badge("b", 2), badge("c", null)],
      birdsMet: 0,
      birdsMetRecent: [],
    }),
};

const fakeFetch = (bodies: Bodies) =>
  vi.fn((input: RequestInfo | URL) => {
    const path = String(input);
    const body = bodies[path];
    if (!body) throw new Error(`unexpected fetch ${path}`);
    return Promise.resolve(body());
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const subs = (s: MoreSources) =>
  Object.fromEntries(MORE_ROWS.map((r) => [r.id, r.sub(s)]));

const sources = (over: Partial<MoreSources> = {}): MoreSources => ({
  sync: SYNC,
  friends: { invitesOut: 1 },
  notes: { total: 23 },
  collection: { postmarks: 4, badges: 2 },
  ...over,
});

describe("MORE_ROWS", () => {
  it("lists the six rows of the mock in order with their titles and hrefs", () => {
    expect(
      MORE_ROWS.map(({ id, title, href }) => ({ id, title, href })),
    ).toEqual([
      { id: "friends", title: "Friends", href: "/friends" },
      { id: "shoebox", title: "Shoebox", href: "/shoebox" },
      { id: "collection", title: "Collection", href: "/collection" },
      { id: "aviary", title: "Aviary", href: "/aviary" },
      { id: "earn", title: "Earn seeds", href: "/earn" },
      { id: "settings", title: "Settings", href: "/settings" },
    ]);
  });

  it("writes the mock's sub lines for the mock's numbers", () => {
    expect(subs(sources())).toEqual({
      friends: "4 friends, 1 invite out",
      shoebox: "23 notes saved",
      collection: "4 postmarks, 2 badges",
      aviary: "Egg hatches in 6 deliveries",
      earn: "Punch card at 6 of 10",
      settings: "Quiet hours are on",
    });
  });

  it("uses singular forms for one of each", () => {
    expect(
      subs(
        sources({
          sync: {
            ...SYNC,
            friendsCount: 1,
            egg: { status: "incubating", deliveriesToGo: 1 },
          },
          friends: { invitesOut: 1 },
          notes: { total: 1 },
          collection: { postmarks: 1, badges: 1 },
        }),
      ),
    ).toMatchObject({
      friends: "1 friend, 1 invite out",
      shoebox: "1 note saved",
      collection: "1 postmark, 1 badge",
      aviary: "Egg hatches in 1 delivery",
    });
    expect(subs(sources({ friends: { invitesOut: 2 } })).friends).toBe(
      "4 friends, 2 invites out",
    );
  });

  it("reads the empty states plainly", () => {
    expect(
      subs(
        sources({
          sync: {
            friendsCount: 0,
            egg: null,
            punchCard: { ...SYNC.punchCard, deliveries: 0 },
            me: { settings: { quietOn: false } },
          },
          friends: { invitesOut: 0 },
          notes: { total: 0 },
          collection: { postmarks: 0, badges: 0 },
        }),
      ),
    ).toEqual({
      friends: "0 friends",
      shoebox: "0 notes saved",
      collection: "0 postmarks, 0 badges",
      aviary: null,
      earn: "Punch card at 0 of 10",
      settings: "Quiet hours are off",
    });
    expect(subs(sources({ friends: { invitesOut: 0 } })).friends).toBe(
      "4 friends",
    );
  });

  it("says a ready egg is ready to hatch", () => {
    expect(
      subs(
        sources({
          sync: { ...SYNC, egg: { status: "ready", deliveriesToGo: 0 } },
        }),
      ).aviary,
    ).toBe("Egg is ready to hatch");
  });

  it("never counts a punch card past its size", () => {
    expect(
      subs(
        sources({
          sync: { ...SYNC, punchCard: { ...SYNC.punchCard, deliveries: 12 } },
        }),
      ).earn,
    ).toBe("Punch card at 10 of 10");
  });

  it("drops only the sub line whose source failed", () => {
    expect(
      subs(sources({ friends: null, notes: null, collection: null })),
    ).toEqual({
      friends: null,
      shoebox: null,
      collection: null,
      aviary: "Egg hatches in 6 deliveries",
      earn: "Punch card at 6 of 10",
      settings: "Quiet hours are on",
    });
  });
});

describe("loadMoreSources", () => {
  it("reads friends, notes and the collection and yields the mock's sub lines", async () => {
    const fetchImpl = fakeFetch(MOCK_BODIES);
    const loaded = await loadMoreSources(SYNC, fetchImpl);
    expect(loaded).toEqual(sources());
    expect(subs(loaded)).toEqual({
      friends: "4 friends, 1 invite out",
      shoebox: "23 notes saved",
      collection: "4 postmarks, 2 badges",
      aviary: "Egg hatches in 6 deliveries",
      earn: "Punch card at 6 of 10",
      settings: "Quiet hours are on",
    });
    expect(fetchImpl.mock.calls.map(([path]) => String(path)).sort()).toEqual([
      "/api/collection",
      "/api/friends",
      "/api/notes",
    ]);
  });

  it("counts no invites when the friends list has no guest links", async () => {
    const loaded = await loadMoreSources(
      SYNC,
      fakeFetch({
        ...MOCK_BODIES,
        "/api/friends": () => json(200, { friends: [] }),
      }),
    );
    expect(loaded.friends).toEqual({ invitesOut: 0 });
  });

  it("turns each failed read into a missing source and keeps the rest", async () => {
    const loaded = await loadMoreSources(
      SYNC,
      fakeFetch({
        "/api/friends": () =>
          json(500, { error: { code: "internal", message: "nope" } }),
        "/api/notes": () => Promise.reject(new TypeError("offline")),
        "/api/collection": () => json(200, { postmarks: "four" }),
      }),
    );
    expect(loaded).toEqual(
      sources({ friends: null, notes: null, collection: null }),
    );
  });

  it("treats a body that is not JSON as a failed read", async () => {
    const loaded = await loadMoreSources(
      SYNC,
      fakeFetch({
        ...MOCK_BODIES,
        "/api/notes": () => new Response("<html>", { status: 200 }),
      }),
    );
    expect(loaded.notes).toBeNull();
    expect(loaded.friends).toEqual({ invitesOut: 1 });
  });
});
