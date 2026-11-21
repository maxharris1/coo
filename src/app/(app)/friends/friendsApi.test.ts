import { describe, expect, it } from "vitest";
import type { FriendRow } from "@/server/services/friends";
import { friendLine, loadFriends, saveShows, withShows } from "./friendsApi";

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

describe("withShows", () => {
  it("changes only the named friend", () => {
    const list = [
      friend({ id: "a" as FriendRow["id"] }),
      friend({ id: "b" as FriendRow["id"] }),
    ];
    expect(withShows(list, "b", "block").map((f) => f.shows)).toEqual([
      "city",
      "block",
    ]);
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

describe("saveShows", () => {
  it("PATCHes the friend with the new choice", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const spy = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await saveShows("u 1", "block", spy)).toEqual({ ok: true });
    expect(calls[0][0]).toBe("/api/friends/u%201");
    expect(calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ shows: "block" });
  });

  it("reports a refusal", async () => {
    expect(
      await saveShows(
        "u1",
        "city",
        reply(404, { error: { message: "Gone." } }),
      ),
    ).toEqual({ ok: false, message: "Gone." });
  });
});
