import { describe, expect, it } from "vitest";
import { quoteFor, release } from "./composeApi";

type Seen = { path: string; init: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const seen: Seen[] = [];
  const fetchImpl = (async (path: string, init: RequestInit) => {
    seen.push({ path, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

const throwing = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

const UNREACHABLE = "We could not reach the loft. Try again.";
const apiError = (message: string) => ({
  error: { code: "conflict", message },
});
const leg = {
  recipient: { friendId: "f1" },
  distanceMi: 81.3,
  from: { label: "New York" },
  to: { label: "Philadelphia" },
  quotes: [],
};

describe("quoteFor", () => {
  it("posts the exact quote body and returns the friend's leg", async () => {
    const { fetchImpl, seen } = fakeFetch(200, { recipients: [leg] });

    const r = await quoteFor(fetchImpl, ["f1"], ["b1", "b2"]);

    expect(r).toEqual({ ok: true, quotes: [leg] });
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe("/api/flights/quote");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.headers).toEqual({
      "content-type": "application/json",
    });
    expect(JSON.parse(seen[0].init.body as string)).toEqual({
      recipients: [{ friendId: "f1" }],
      birdIds: ["b1", "b2"],
    });
  });

  it("asks for several recipients and returns every leg", async () => {
    const other = { ...leg, recipient: { friendId: "f2" } };
    const { fetchImpl, seen } = fakeFetch(200, { recipients: [leg, other] });

    const r = await quoteFor(fetchImpl, ["f1", "f2"], ["b1", "b2"]);

    expect(r).toEqual({ ok: true, quotes: [leg, other] });
    expect(JSON.parse(seen[0].init.body as string)).toEqual({
      recipients: [{ friendId: "f1" }, { friendId: "f2" }],
      birdIds: ["b1", "b2"],
    });
  });

  it("carries the API's message", async () => {
    const { fetchImpl } = fakeFetch(409, apiError("Set up your loft first"));
    expect(await quoteFor(fetchImpl, ["f1"], ["b1"])).toEqual({
      ok: false,
      message: "Set up your loft first",
    });
  });

  it("fails when the reply has no leg", async () => {
    const { fetchImpl } = fakeFetch(200, { recipients: [] });
    expect(await quoteFor(fetchImpl, ["f1"], ["b1"])).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });

  it("fails when fetch throws", async () => {
    expect(await quoteFor(throwing, ["f1"], ["b1"])).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });
});

describe("release", () => {
  const send = {
    body: "Dinner Saturday?",
    sends: [{ friendId: "f1", birdId: "b1" }],
  };

  it("posts the exact release body and returns the flight id", async () => {
    const { fetchImpl, seen } = fakeFetch(201, {
      flights: [{ id: "fl1", kind: "delivery" }],
    });

    const r = await release(fetchImpl, send);

    expect(r).toEqual({ ok: true, flightIds: ["fl1"] });
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe("/api/flights");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.headers).toEqual({
      "content-type": "application/json",
    });
    expect(JSON.parse(seen[0].init.body as string)).toEqual({
      body: "Dinner Saturday?",
      sends: [{ friendId: "f1", birdId: "b1" }],
    });
  });

  it("posts every send and returns every flight id", async () => {
    const { fetchImpl, seen } = fakeFetch(201, {
      flights: [
        { id: "fl1", kind: "delivery" },
        { id: "fl2", kind: "delivery" },
        { id: "fl3", kind: "delivery" },
      ],
    });
    const sends = [
      { friendId: "f1", birdId: "b1" },
      { friendId: "f2", birdId: "b2" },
      { friendId: "f3", birdId: "b3" },
    ];

    const r = await release(fetchImpl, { body: "Dinner Saturday?", sends });

    expect(r).toEqual({ ok: true, flightIds: ["fl1", "fl2", "fl3"] });
    expect(JSON.parse(seen[0].init.body as string)).toEqual({
      body: "Dinner Saturday?",
      sends,
    });
  });

  it("fails when a flight in the reply has no id", async () => {
    const { fetchImpl } = fakeFetch(201, { flights: [{ id: "fl1" }, {}] });
    expect(await release(fetchImpl, send)).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });

  it("carries the API's message", async () => {
    const { fetchImpl } = fakeFetch(409, apiError("Gerald is too tired"));
    expect(await release(fetchImpl, send)).toEqual({
      ok: false,
      message: "Gerald is too tired",
    });
  });

  it("fails when the reply has no flight", async () => {
    const { fetchImpl } = fakeFetch(201, { flights: [] });
    expect(await release(fetchImpl, send)).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });

  it("fails when fetch throws", async () => {
    expect(await release(throwing, send)).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });
});
