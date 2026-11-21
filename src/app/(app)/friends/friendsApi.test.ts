import { describe, expect, it } from "vitest";
import type { FriendRow } from "@/server/services/friends";
import { friendLine, loadFriends } from "./friendsApi";

const friend = (over: Partial<FriendRow>): FriendRow =>
  ({
    id: "u1",
    name: "Priya",
    handle: "priya",
    shows: "city",
    theyShow: "city",
    where: "Philadelphia",
    distanceMi: 81.2,
    ...over,
  }) as FriendRow;

const reply = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("friendLine", () => {
  it("names the place and the rounded distance", () => {
    expect(friendLine(friend({}), "mi")).toBe("Philadelphia, 81 mi");
    expect(friendLine(friend({ distanceMi: 190 }), "km")).toBe(
      "Philadelphia, 306 km",
    );
  });

  it("says how many blocks over for a close friend", () => {
    expect(friendLine(friend({ distanceMi: 0.15 }), "mi")).toBe(
      "3 blocks over",
    );
  });

  it("falls back to the place alone when there is no distance", () => {
    expect(friendLine(friend({ distanceMi: null }), "mi")).toBe("Philadelphia");
    expect(friendLine(friend({ where: null, distanceMi: null }), "mi")).toBe(
      "No roost yet",
    );
  });
});

describe("loadFriends", () => {
  it("returns the friends and waiting links", async () => {
    const body = { friends: [friend({})], guestLinks: [] };
    expect(await loadFriends(reply(200, body))).toEqual({ ok: true, ...body });
  });

  it("returns the API's message on failure", async () => {
    expect(
      await loadFriends(reply(403, { error: { message: "Not yours." } })),
    ).toEqual({ ok: false, message: "Not yours." });
  });

  it("survives a network error", async () => {
    const down = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await loadFriends(down)).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});
