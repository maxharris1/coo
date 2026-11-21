import { describe, expect, it } from "vitest";
import type { Flight } from "@/server/services/flights/shape";
import { delayedCount, sendSearchParty } from "./incidentApi";

type Seen = { path: string; init: RequestInit };

function fakeFetch(routes: Record<string, { status: number; body: unknown }>) {
  const seen: Seen[] = [];
  const fetchImpl = (async (path: string, init: RequestInit) => {
    seen.push({ path, init });
    const route = routes[path];
    if (!route) throw new Error(`unexpected ${path}`);
    return new Response(JSON.stringify(route.body), { status: route.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

const throwing = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

const UNREACHABLE = "We could not reach the loft. Try again.";

const flight = (id: string, role: Flight["role"], delayed: boolean): Flight =>
  ({ id, role, plan: { delayed } }) as unknown as Flight;

const page = (over: Record<string, unknown>) => ({
  status: 200,
  body: {
    yours: [],
    incoming: [],
    landedToday: [],
    earlier: [],
    nextCursor: null,
    ...over,
  },
});

describe("delayedCount", () => {
  it("counts my delayed flights across every page, once each", async () => {
    const current = {
      yours: [flight("a", "mine", true), flight("b", "mine", false)],
      incoming: [flight("c", "incoming", true)],
      landedToday: [flight("d", "mine", true)],
    };
    const { fetchImpl, seen } = fakeFetch({
      "/api/flights": page({
        ...current,
        earlier: [flight("e", "mine", true), flight("f", "incoming", true)],
        nextCursor: "p2",
      }),
      "/api/flights?cursor=p2": page({
        ...current,
        earlier: [flight("g", "mine", true), flight("h", "mine", false)],
      }),
    });

    expect(await delayedCount(fetchImpl)).toEqual({ ok: true, count: 4 });
    expect(seen.map((s) => s.path)).toEqual([
      "/api/flights",
      "/api/flights?cursor=p2",
    ]);
  });

  it("counts a flight with no plan as on time", async () => {
    const unplanned = { id: "s", role: "mine" } as Flight;
    const { fetchImpl } = fakeFetch({
      "/api/flights": page({ yours: [unplanned] }),
    });
    expect(await delayedCount(fetchImpl)).toEqual({ ok: true, count: 0 });
  });

  it("carries the API's message when a page fails", async () => {
    const { fetchImpl } = fakeFetch({
      "/api/flights": page({ nextCursor: "p2" }),
      "/api/flights?cursor=p2": {
        status: 400,
        body: { error: { code: "invalid", message: "Bad page." } },
      },
    });
    expect(await delayedCount(fetchImpl)).toEqual({
      ok: false,
      message: "Bad page.",
    });
  });

  it("reports an unreachable loft", async () => {
    expect(await delayedCount(throwing)).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });
});

describe("sendSearchParty", () => {
  const PATH = "/api/flights/f%201/search-party";

  it("posts an empty body and returns the updated flight", async () => {
    const updated = { id: "f 1", searchParty: "found" };
    const { fetchImpl, seen } = fakeFetch({
      [PATH]: { status: 200, body: { flight: updated } },
    });

    expect(await sendSearchParty(fetchImpl, "f 1")).toEqual({
      ok: true,
      flight: updated,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.headers).toEqual({
      "content-type": "application/json",
    });
    expect(JSON.parse(seen[0].init.body as string)).toEqual({});
  });

  it("carries the refusal's message", async () => {
    const { fetchImpl } = fakeFetch({
      [PATH]: {
        status: 409,
        body: {
          error: { code: "conflict", message: "A search party already went." },
        },
      },
    });
    expect(await sendSearchParty(fetchImpl, "f 1")).toEqual({
      ok: false,
      message: "A search party already went.",
    });
  });

  it("refuses a reply with no flight", async () => {
    const { fetchImpl } = fakeFetch({ [PATH]: { status: 200, body: {} } });
    expect(await sendSearchParty(fetchImpl, "f 1")).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });

  it("reports an unreachable loft", async () => {
    expect(await sendSearchParty(throwing, "f 1")).toEqual({
      ok: false,
      message: UNREACHABLE,
    });
  });
});
