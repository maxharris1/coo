import { describe, expect, it } from "vitest";
import type { FriendRow } from "@/server/services/friends";
import {
  blockFriend,
  friendLine,
  loadFriends,
  reportFriend,
  saveShows,
  unfriend,
} from "./friendsApi";

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

describe("friend actions", () => {
  const recorder = (status: number, body: unknown) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  };

  it("unfriends with DELETE /api/friends/[id]", async () => {
    const { calls, fetchImpl } = recorder(200, {});
    expect(await unfriend("u1", fetchImpl)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/friends/u1");
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("blocks with POST /api/friends/[id]/block", async () => {
    const { calls, fetchImpl } = recorder(200, {});
    expect(await blockFriend("u1", fetchImpl)).toEqual({ ok: true });
    expect(calls[0].url).toBe("/api/friends/u1/block");
    expect(calls[0].init?.method).toBe("POST");
  });

  it("reports with POST /api/reports naming the friend and the reason", async () => {
    const { calls, fetchImpl } = recorder(200, {});
    expect(await reportFriend("u1", "Rude notes", fetchImpl)).toEqual({
      ok: true,
    });
    expect(calls[0].url).toBe("/api/reports");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      userId: "u1",
      reason: "Rude notes",
    });
  });

  it("returns the API's message when an action fails", async () => {
    const { fetchImpl } = recorder(429, { error: { message: "Slow down." } });
    expect(await blockFriend("u1", fetchImpl)).toEqual({
      ok: false,
      message: "Slow down.",
    });
  });

  it("saves City/Block with PATCH /api/friends/[id] and returns the server's value", async () => {
    const { calls, fetchImpl } = recorder(200, {
      friend: { id: "u1", shows: "block" },
    });
    expect(await saveShows("u1", "block", fetchImpl)).toEqual({
      ok: true,
      shows: "block",
    });
    expect(calls[0].url).toBe("/api/friends/u1");
    expect(calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ shows: "block" });
  });

  it("returns the API's message when a City/Block save fails", async () => {
    const { fetchImpl } = recorder(404, { error: { message: "No such friend" } });
    expect(await saveShows("u1", "city", fetchImpl)).toEqual({
      ok: false,
      message: "No such friend",
    });
  });
});
