import { describe, expect, it } from "vitest";
import { claimLink } from "./claimLink";

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("claimLink", () => {
  it("posts an empty body to the link's claim API", async () => {
    const { calls, fetchImpl } = fakeFetch(200, { friendId: "u1" });
    await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl);
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe("/api/guest/k3Hq9ZtB2mXw7PaL/claim");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("goes to Reply while the bird waits on the sill", async () => {
    const { fetchImpl } = fakeFetch(200, {
      friendId: "u1",
      visitId: "v-42",
      serverNow: 1,
    });
    expect(await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl)).toEqual({
      ok: true,
      next: "/sill/v-42/reply",
    });
  });

  it("goes to the shoebox once the bird has gone home", async () => {
    const { fetchImpl } = fakeFetch(200, { friendId: "u1", serverNow: 1 });
    expect(await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl)).toEqual({
      ok: true,
      next: "/shoebox",
    });
  });

  it("passes the API's error message through", async () => {
    const { fetchImpl } = fakeFetch(410, {
      error: { code: "gone", message: "This link has been claimed." },
    });
    expect(await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl)).toEqual({
      ok: false,
      message: "This link has been claimed.",
    });
  });

  it("falls back to a plain message when the API cannot be reached", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl)).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});
