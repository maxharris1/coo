import { describe, expect, it } from "vitest";
import { quoteAt, send } from "./forecastApi";

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
const SEVEN_AM = Date.parse("2026-11-21T12:00:00Z");
const ONE_PM = Date.parse("2026-11-21T18:00:00Z");
const leg = {
  recipient: { friendId: "u2" },
  distanceMi: 81.3,
  from: { label: "Brooklyn" },
  to: { label: "Philadelphia" },
  quotes: [],
};
const draft = { friendId: "u2", birdId: "b1", body: "Dinner Saturday?" };

describe("quoteAt", () => {
  it("posts the friend, the bird and every departure hour", async () => {
    const { fetchImpl, seen } = fakeFetch(200, { recipients: [leg] });

    const r = await quoteAt(fetchImpl, "u2", "b1", [SEVEN_AM, ONE_PM]);

    expect(r).toEqual({ ok: true, quote: leg });
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe("/api/flights/quote");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.headers).toEqual({
      "content-type": "application/json",
    });
    expect(JSON.parse(seen[0].init.body as string)).toEqual({
      recipients: [{ friendId: "u2" }],
      birdIds: ["b1"],
      at: [SEVEN_AM, ONE_PM],
    });
  });

  it("carries the API's message", async () => {
    const { fetchImpl } = fakeFetch(409, apiError("Set up your loft first"));
    expect(await quoteAt(fetchImpl, "u2", "b1", [ONE_PM])).toEqual({
      ok: false,
      message: "Set up your loft first",
    });
  });

  it("fails when the reply has no leg", async () => {
    const { fetchImpl } = fakeFetch(200, { recipients: [] });
    expect(await quoteAt(fetchImpl, "u2", "b1", [ONE_PM])).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });

  it("fails when fetch throws", async () => {
    expect(await quoteAt(throwing, "u2", "b1", [ONE_PM])).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });
});

describe("send", () => {
  it("schedules the draft for a later hour", async () => {
    const { fetchImpl, seen } = fakeFetch(201, {
      flights: [{ id: "fl1", kind: "delivery" }],
    });

    const r = await send(fetchImpl, draft, SEVEN_AM);

    expect(r).toEqual({ ok: true, flightId: "fl1" });
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe("/api/flights");
    expect(seen[0].init.method).toBe("POST");
    expect(JSON.parse(seen[0].init.body as string)).toEqual({
      body: "Dinner Saturday?",
      sends: [{ friendId: "u2", birdId: "b1" }],
      releaseAt: SEVEN_AM,
    });
  });

  it("releases at once with no releaseAt", async () => {
    const { fetchImpl, seen } = fakeFetch(201, { flights: [{ id: "fl1" }] });

    expect(await send(fetchImpl, draft, undefined)).toEqual({
      ok: true,
      flightId: "fl1",
    });
    expect(JSON.parse(seen[0].init.body as string)).toEqual({
      body: "Dinner Saturday?",
      sends: [{ friendId: "u2", birdId: "b1" }],
    });
  });

  it("carries the API's message", async () => {
    const { fetchImpl } = fakeFetch(
      400,
      apiError("releaseAt: outside the schedule window"),
    );
    expect(await send(fetchImpl, draft, SEVEN_AM)).toEqual({
      ok: false,
      message: "releaseAt: outside the schedule window",
    });
  });

  it("fails when the reply has no flight", async () => {
    const { fetchImpl } = fakeFetch(201, { flights: [] });
    expect(await send(fetchImpl, draft, SEVEN_AM)).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });

  it("fails when fetch throws", async () => {
    expect(await send(throwing, draft, SEVEN_AM)).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });
});
