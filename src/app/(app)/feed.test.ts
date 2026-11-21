import { describe, expect, it, vi } from "vitest";
import { feedBird } from "./feed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const okFetch = () =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    Response.json({ ok: true }),
  );

describe("feedBird (ac-2)", () => {
  it("POSTs the feed endpoint with a fresh uuid actionId per tap", async () => {
    const fetchImpl = okFetch();
    await feedBird("b1", fetchImpl);
    await feedBird("b1", fetchImpl);

    const [[url, init], [, second]] = fetchImpl.mock.calls as [
      string,
      RequestInit,
    ][];
    expect(url).toBe("/api/birds/b1/feed");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    const first = JSON.parse(String(init.body)) as { actionId: string };
    const again = JSON.parse(String(second.body)) as { actionId: string };
    expect(Object.keys(first)).toEqual(["actionId"]);
    expect(first.actionId).toMatch(UUID);
    expect(again.actionId).toMatch(UUID);
    expect(again.actionId).not.toBe(first.actionId);
  });

  it("encodes the bird id into the path", async () => {
    const fetchImpl = okFetch();
    await feedBird("a/b", fetchImpl);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/birds/a%2Fb/feed");
  });

  it("rejects with the server's message on a non-OK response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { code: "insufficient_seeds", message: "Not enough seeds." } },
        { status: 409 },
      ),
    );
    await expect(feedBird("b1", fetchImpl)).rejects.toThrow(
      "Not enough seeds.",
    );
  });

  it("rejects with a fallback when the server gives no message", async () => {
    const fetchImpl = vi.fn(async () => new Response("oops", { status: 500 }));
    await expect(feedBird("b1", fetchImpl)).rejects.toThrow(
      "We could not reach the loft. Try again.",
    );
  });

  it("rejects with the fallback when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(feedBird("b1", fetchImpl)).rejects.toThrow(
      "We could not reach the loft. Try again.",
    );
  });
});
