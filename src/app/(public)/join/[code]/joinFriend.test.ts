import { describe, expect, it } from "vitest";
import { joinFriend } from "./joinFriend";

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("joinFriend", () => {
  it("posts the code to the join API", async () => {
    const { calls, fetchImpl } = fakeFetch(200, {
      friend: { id: "x", name: "Priya", handle: "priya" },
    });
    expect(await joinFriend("priya-AAAA", fetchImpl)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe("/api/friends/join");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual({ code: "priya-AAAA" });
  });

  it("passes the API's error message through", async () => {
    const { fetchImpl } = fakeFetch(400, {
      error: { code: "invalid", message: "That is your own code" },
    });
    expect(await joinFriend("mine", fetchImpl)).toEqual({
      ok: false,
      message: "That is your own code",
    });
  });

  it("falls back to a plain message when the API cannot be reached", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await joinFriend("priya-AAAA", fetchImpl)).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });

  it("falls back when an error body has no message", async () => {
    const { fetchImpl } = fakeFetch(500, "nope");
    expect(await joinFriend("priya-AAAA", fetchImpl)).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});
