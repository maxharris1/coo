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

function interrupted() {
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"visitId":'));
        c.error(new TypeError("connection lost while reading response body"));
      },
    }),
    { status: 200 },
  );
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

  it("retries when a successful claim's body is cut off mid-read", async () => {
    const fetchImpl = (async () => interrupted()) as unknown as typeof fetch;
    expect(await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl)).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
      retry: true,
    });
  });

  it("retries when a successful claim's body is not a claim", async () => {
    for (const body of ["", "not json", "null", "{}", '{"visitId":"v-42"}']) {
      const fetchImpl = (async () =>
        new Response(body, { status: 200 })) as unknown as typeof fetch;
      expect(await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl), body).toEqual({
        ok: false,
        message: "We could not reach the loft. Try again.",
        retry: true,
      });
    }
  });

  it("passes the API's error message through", async () => {
    const { fetchImpl } = fakeFetch(410, {
      error: { code: "gone", message: "This link has been claimed." },
    });
    expect(await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl)).toEqual({
      ok: false,
      message: "This link has been claimed.",
      retry: false,
    });
  });

  it("marks a server failure or rate limit as worth retrying", async () => {
    for (const status of [500, 503, 429]) {
      const { fetchImpl } = fakeFetch(status, {});
      expect(await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl)).toMatchObject({
        ok: false,
        retry: true,
      });
    }
  });

  it("falls back to a plain message when the API cannot be reached", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await claimLink("k3Hq9ZtB2mXw7PaL", fetchImpl)).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
      retry: true,
    });
  });
});
