import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { z } from "zod";
import { makeTestDeps } from "@/test/deps";
import { FakeClock } from "@/test/fakes/clock";
import { testDb } from "@/test/testDb";
import type { Db } from "./db";
import { AppError, type ErrorCode } from "./errors";
import { createHandler } from "./handler";

const START = Date.UTC(2026, 10, 19, 15);
const URL_X = "https://coo.test/api/x";
const GENERIC = "Something went wrong";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let db: Db;
const clock = new FakeClock(START);
const handler = createHandler(() => makeTestDeps({ db, clock }));

beforeAll(async () => {
  db = await testDb();
});

beforeEach(() => clock.set(START));

afterEach(() => vi.restoreAllMocks());

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(URL_X, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("ac-1 error shape and serverNow", () => {
  it.each<[ErrorCode, number]>([
    ["unauthenticated", 401],
    ["not_onboarded", 409],
    ["invalid", 400],
    ["not_found", 404],
    ["forbidden", 403],
    ["conflict", 409],
    ["insufficient_seeds", 402],
    ["rate_limited", 429],
    ["gone", 410],
    ["internal", 500],
  ])("AppError %s responds %i", async (code, status) => {
    const route = handler({}, async () => {
      throw new AppError(code, "msg");
    });
    const res = await route(post("{}"));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({
      error: { code, message: "msg" },
      serverNow: clock.now(),
    });
  });

  it("hides an unexpected error and logs only a request id and its message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = handler(
      { body: z.object({ note: z.string() }) },
      async () => {
        throw new Error("secret detail");
      },
    );
    const res = await route(post(JSON.stringify({ note: "BODY-MARKER-77" })));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: "internal", message: GENERIC },
      serverNow: clock.now(),
    });
    expect(text).not.toContain("secret detail");
    expect(log).toHaveBeenCalled();
    for (const args of log.mock.calls) {
      expect(args[0]).toMatch(UUID);
      expect(JSON.stringify(args)).not.toContain("BODY-MARKER-77");
    }
  });

  it("names the failing field when the body fails the schema", async () => {
    const run = vi.fn(async () => ({}));
    const route = handler(
      { body: z.object({ bird: z.object({ name: z.string() }) }) },
      run,
    );
    const res = await route(post(JSON.stringify({ bird: { name: 3 } })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid");
    expect(json.error.message).toContain("bird.name");
    expect(json.serverNow).toBe(clock.now());
    expect(run).not.toHaveBeenCalled();
  });

  it("names body when the schema rejects the whole value", async () => {
    const route = handler(
      { body: z.object({ a: z.string() }) },
      async () => ({}),
    );
    const res = await route(post("[]"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("body");
  });

  it("rejects malformed JSON as invalid without calling run", async () => {
    const run = vi.fn(async () => ({}));
    const route = handler({ body: z.object({ a: z.string() }) }, run);
    const res = await route(post("{not json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid");
    expect(json.error.message).toContain("body");
    expect(run).not.toHaveBeenCalled();
  });

  it("returns the result with serverNow from the clock and passes parsed input", async () => {
    const run = vi.fn(async (_deps: unknown, input: { n: number }) => ({
      doubled: input.n * 2,
    }));
    const route = handler({ body: z.object({ n: z.coerce.number() }) }, run);

    const first = await route(post(JSON.stringify({ n: "21" })));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ doubled: 42, serverNow: START });
    expect(run.mock.calls[0][1]).toEqual({ n: 21 });

    clock.advance(60_000);
    const second = await route(post(JSON.stringify({ n: 1 })));
    expect((await second.json()).serverNow).toBe(START + 60_000);
  });
});

describe("ac-2 cross-site write refusal", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s from another origin is forbidden before run",
    async (method) => {
      const run = vi.fn(async () => ({ ok: true }));
      const route = handler({}, run);
      const res = await route(
        new Request(URL_X, {
          method,
          headers: { origin: "https://evil.example" },
        }),
      );
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("forbidden");
      expect(json.serverNow).toBe(clock.now());
      expect(run).not.toHaveBeenCalled();
    },
  );

  it("allows a same-origin write", async () => {
    const run = vi.fn(async () => ({ ok: true }));
    const res = await handler(
      {},
      run,
    )(
      new Request(URL_X, {
        method: "POST",
        headers: { origin: "https://coo.test" },
      }),
    );
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("allows a write with no Origin header", async () => {
    const res = await handler({}, async () => ({ ok: true }))(
      new Request(URL_X, { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });

  it("allows a cross-origin GET", async () => {
    const res = await handler({}, async () => ({ ok: true }))(
      new Request(URL_X, { headers: { origin: "https://evil.example" } }),
    );
    expect(res.status).toBe(200);
  });

  it("responds internal without serverNow when deps cannot be built", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const build = vi.fn(() => Promise.reject(new Error("db down")));
    const res = await createHandler(build)({}, async () => ({ ok: true }))(
      new Request(URL_X, { method: "POST" }),
    );
    expect(build).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "internal", message: GENERIC },
    });
  });
});

describe("input typing", () => {
  it("is undefined without a schema and the parsed type with one", async () => {
    const bare = handler({}, async (_deps, input) => {
      expectTypeOf(input).toEqualTypeOf<undefined>();
      return { got: input === undefined };
    });
    expect(await (await bare(new Request(URL_X))).json()).toMatchObject({
      got: true,
    });

    const typed = handler(
      { body: z.object({ n: z.number() }) },
      async (_deps, input) => {
        expectTypeOf(input).toEqualTypeOf<{ n: number }>();
        return { n: input.n };
      },
    );
    expect(await (await typed(post('{"n":5}'))).json()).toMatchObject({ n: 5 });
  });
});
