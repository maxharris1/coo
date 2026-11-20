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
import { log } from "./log";

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
    const logged = vi.spyOn(log, "error").mockImplementation(() => {});
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
    expect(logged).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith("server.unhandled", {
      requestId: expect.stringMatching(UUID),
      error: "secret detail",
    });
  });

  it.each<[string, () => unknown]>([
    ["an object with toString null", () => ({ toString: null })],
    ["a null-prototype object", () => Object.create(null)],
    [
      "an object with a non-callable toString",
      () => ({ toString: "upstream field", message: "private" }),
    ],
    [
      "a proxy whose prototype lookup throws",
      () =>
        new Proxy(
          {},
          {
            getPrototypeOf() {
              throw new Error("trap");
            },
          },
        ),
    ],
  ])("responds generic internal when run throws %s", async (_name, make) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const route = handler({}, async () => {
      throw make();
    });
    const res = await route(post("{}"));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: "internal", message: GENERIC },
      serverNow: clock.now(),
    });
    expect(text).not.toContain("private");
  });

  it("responds generic internal through the real logger when an Error message throws under inspection", async () => {
    const sink = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = {
      get detail(): never {
        throw new Error("getter");
      },
      toJSON(): never {
        throw new Error("toJSON");
      },
      toString(): never {
        throw new Error("toString");
      },
      [Symbol.for("nodejs.util.inspect.custom")](): never {
        throw new Error("inspect");
      },
    };
    const err = new Error();
    Object.defineProperty(err, "message", { value: message });
    const route = handler({}, async () => {
      throw err;
    });
    const res = await route(post("{}"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "internal", message: GENERIC },
      serverNow: clock.now(),
    });
    expect(sink).toHaveBeenCalledOnce();
    expect(JSON.parse(String(sink.mock.calls[0]![0]))).toMatchObject({
      event: "server.unhandled",
      error: "unprintable thrown value",
    });
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
  it.each<[string, string, () => Promise<never>]>([
    ["POST", "a rejecting", () => Promise.reject(new Error("db down"))],
    ["PUT", "a rejecting", () => Promise.reject(new Error("db down"))],
    ["PATCH", "a rejecting", () => Promise.reject(new Error("db down"))],
    ["DELETE", "a rejecting", () => Promise.reject(new Error("db down"))],
    [
      "POST",
      "a synchronously throwing",
      () => {
        throw new Error("dependency factory failed");
      },
    ],
    [
      "DELETE",
      "a synchronously throwing",
      () => {
        throw new Error("dependency factory failed");
      },
    ],
  ])(
    "%s from another origin is forbidden before deps or run, with %s dependency factory",
    async (method, _factory, fail) => {
      const build = vi.fn(fail);
      const run = vi.fn(async () => ({ ok: true }));
      const res = await createHandler(build)({}, run)(
        new Request(URL_X, {
          method,
          headers: { origin: "https://evil.example" },
        }),
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: { code: "forbidden", message: "Cross-site request refused" },
      });
      expect(build).not.toHaveBeenCalled();
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

  it.each<[string, () => Promise<never>]>([
    ["rejects", () => Promise.reject(new Error("db down"))],
    [
      "throws synchronously",
      () => {
        throw new Error("dependency factory failed");
      },
    ],
  ])(
    "responds internal without serverNow when the dependency factory %s",
    async (_name, fail) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const build = vi.fn(fail);
      const res = await createHandler(build)({}, async () => ({ ok: true }))(
        new Request(URL_X, { method: "POST" }),
      );
      expect(build).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: { code: "internal", message: GENERIC },
      });
    },
  );
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
