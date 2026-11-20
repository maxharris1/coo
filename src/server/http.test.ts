import { NextRequest } from "next/server";
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
import { toE164, type E164 } from "@/lib/phone";
import { makeTestDeps } from "@/test/deps";
import { FakeClock } from "@/test/fakes/clock";
import { FakeJar } from "@/test/fakes/jar";
import { testDb } from "@/test/testDb";
import type { Caller, OnboardedCaller } from "./auth";
import type { Db } from "./db";
import { AppError, type ErrorCode } from "./errors";
import { createJsonRoute } from "./http";
import { log } from "./log";
import type { UserId } from "./ports/auth";
import { TEST_SESSION_COOKIE } from "./testAuth";

const START = Date.UTC(2026, 10, 19, 15);
const URL_X = "https://coo.test/api/x";
const REF = /^[a-p]{8}-[a-p]{4}-[a-p]{4}-[a-p]{4}-[a-p]{12}$/;
const INTERNAL = expect.stringMatching(
  /^Something went wrong \(ref [a-p]{8}-[a-p]{4}-[a-p]{4}-[a-p]{4}-[a-p]{12}\)$/,
);

let db: Db;
const clock = new FakeClock(START);
const testDeps = () => makeTestDeps({ db, clock });
const jsonRoute = createJsonRoute(testDeps);

beforeAll(async () => {
  db = await testDb();
});

beforeEach(() => {
  clock.set(START);
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function post(body: string, headers: Record<string, string> = {}) {
  return new NextRequest(URL_X, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function refOf(message: string): string {
  const ref = /\(ref ([^)]+)\)$/.exec(message)?.[1];
  expect(ref).toMatch(REF);
  return ref!;
}

let phones = 0;
const nextPhone = () =>
  toE164(`555${String(++phones).padStart(7, "0")}`) as E164;

async function signIn(): Promise<{ id: UserId; cookie: string }> {
  const jar = new FakeJar();
  const id = await (
    await testDeps()
  )
    .auth(jar)
    .verifyCode(nextPhone(), "000000");
  if (!id) throw new Error("test sign-in failed");
  const cookie = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  return { id, cookie };
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
    const route = jsonRoute("public", {}, async () => {
      throw new AppError(code, "msg");
    });
    const res = await route(post("{}"));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({
      error: { code, message: "msg" },
      serverNow: clock.now(),
    });
  });

  it("hides an unexpected error and logs only a request id and the path", async () => {
    const logged = vi.spyOn(log, "error").mockImplementation(() => {});
    const route = jsonRoute(
      "public",
      { body: z.object({ note: z.string() }) },
      async () => {
        throw new Error("secret detail");
      },
    );
    const res = await route(post(JSON.stringify({ note: "BODY-MARKER-77" })));
    const text = await res.text();
    expect(res.status).toBe(500);
    const json = JSON.parse(text);
    expect(json).toEqual({
      error: { code: "internal", message: INTERNAL },
      serverNow: clock.now(),
    });
    expect(text).not.toContain("secret detail");
    expect(logged).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith("http.internal", {
      requestId: refOf(json.error.message),
      path: "/api/x",
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
    const route = jsonRoute("public", {}, async () => {
      throw make();
    });
    const res = await route(post("{}"));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: "internal", message: INTERNAL },
      serverNow: clock.now(),
    });
    expect(text).not.toContain("private");
  });

  it("responds generic internal through the real logger without inspecting an Error whose message throws", async () => {
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
    const route = jsonRoute("public", {}, async () => {
      throw err;
    });
    const res = await route(post("{}"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({
      error: { code: "internal", message: INTERNAL },
      serverNow: clock.now(),
    });
    expect(sink).toHaveBeenCalledOnce();
    expect(JSON.parse(String(sink.mock.calls[0]![0]))).toEqual({
      level: "error",
      event: "http.internal",
      requestId: refOf(json.error.message),
      path: "/api/x",
    });
  });

  it("names the failing field when the body fails the schema", async () => {
    const run = vi.fn(async () => ({}));
    const route = jsonRoute(
      "public",
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
    const route = jsonRoute(
      "public",
      { body: z.object({ a: z.string() }) },
      async () => ({}),
    );
    const res = await route(post("[]"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("body");
  });

  it("rejects malformed JSON as invalid without calling run", async () => {
    const run = vi.fn(async () => ({}));
    const route = jsonRoute(
      "public",
      { body: z.object({ a: z.string() }) },
      run,
    );
    const res = await route(post("{not json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid");
    expect(json.error.message).toContain("body");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a body that is not application/json before building deps or calling run", async () => {
    const build = vi.fn(testDeps);
    const run = vi.fn(async () => ({}));
    const route = createJsonRoute(build)(
      "public",
      { body: z.object({ a: z.string() }) },
      run,
    );
    const res = await route(
      post('{"a":"x"}', { "content-type": "text/plain" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "invalid", message: "body must be application/json" },
    });
    expect(build).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("accepts application/json with a charset parameter", async () => {
    const route = jsonRoute(
      "public",
      { body: z.object({ a: z.string() }) },
      async ({ input }) => ({ a: input.a }),
    );
    const res = await route(
      post('{"a":"x"}', { "content-type": "application/json; charset=utf-8" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ a: "x" });
  });

  it("returns the result with serverNow from the clock and passes parsed input", async () => {
    const run = vi.fn(async ({ input }: { input: { n: number } }) => ({
      doubled: input.n * 2,
    }));
    const route = jsonRoute(
      "public",
      { body: z.object({ n: z.coerce.number() }) },
      run,
    );

    const first = await route(post(JSON.stringify({ n: "21" })));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ doubled: 42, serverNow: START });
    expect(run.mock.calls[0][0].input).toEqual({ n: 21 });

    clock.advance(60_000);
    const second = await route(post(JSON.stringify({ n: 1 })));
    expect((await second.json()).serverNow).toBe(START + 60_000);
  });
});

describe("ac-2 declared access", () => {
  describe.each(["user", "onboarded"] as const)("a %s route", (access) => {
    it.each(["GET", "POST"])(
      "answers %s without a session with 401 and never runs",
      async (method) => {
        const run = vi.fn(async () => ({ ok: true }));
        const res = await jsonRoute(
          access,
          {},
          run,
        )(new NextRequest(URL_X, { method }));
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({
          error: { code: "unauthenticated", message: expect.any(String) },
          serverNow: clock.now(),
        });
        expect(run).not.toHaveBeenCalled();
      },
    );

    it("answers 401 rather than 400 to a POST with no session and an invalid body", async () => {
      const run = vi.fn(async () => ({ ok: true }));
      const res = await jsonRoute(
        access,
        { body: z.object({ n: z.number() }) },
        run,
      )(post("{not json"));
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthenticated");
      expect(run).not.toHaveBeenCalled();
    });
  });

  it("gives a user route the signed-in caller", async () => {
    const { id, cookie } = await signIn();
    const run = vi.fn(async ({ caller }: { caller: Caller }) => ({
      userId: caller.userId,
    }));
    const res = await jsonRoute(
      "user",
      {},
      run,
    )(new NextRequest(URL_X, { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: id, serverNow: clock.now() });
    expect(run.mock.calls[0][0].caller).toEqual({ userId: id, profile: null });
  });

  it("answers an onboarded route with 409 not_onboarded when the caller has no profile", async () => {
    const { cookie } = await signIn();
    const run = vi.fn(async () => ({ ok: true }));
    const res = await jsonRoute(
      "onboarded",
      {},
      run,
    )(new NextRequest(URL_X, { headers: { cookie } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("not_onboarded");
    expect(run).not.toHaveBeenCalled();
  });

  it("gives an onboarded route the onboarded caller", async () => {
    const { id, cookie } = await signIn();
    const at = new Date(Date.UTC(2026, 10, 19, 12));
    await db.query(
      `insert into profiles (id, name, handle, invite_code, onboarded_at)
       values ($1, 'Max', 'max', 'invite-max', $2)`,
      [id, at],
    );
    const run = vi.fn(async ({ caller }: { caller: OnboardedCaller }) => ({
      userId: caller.userId,
    }));
    const res = await jsonRoute(
      "onboarded",
      {},
      run,
    )(new NextRequest(URL_X, { headers: { cookie } }));
    expect(res.status).toBe(200);
    const { caller } = run.mock.calls[0][0];
    expect(caller.userId).toBe(id);
    expect(caller.profile).toMatchObject({ id, onboarded_at: at });
  });

  it("types the caller by access level", () => {
    jsonRoute("public", {}, async ({ caller }) => {
      expectTypeOf(caller).toEqualTypeOf<null>();
      return {};
    });
    jsonRoute("user", {}, async ({ caller }) => {
      expectTypeOf(caller).toEqualTypeOf<Caller>();
      return {};
    });
    jsonRoute("onboarded", {}, async ({ caller }) => {
      expectTypeOf(caller).toEqualTypeOf<OnboardedCaller>();
      return {};
    });
  });
});

describe("auth cookies reach the response", () => {
  it("sends the session cookie a run sets", async () => {
    const route = jsonRoute("public", {}, async ({ auth }) => {
      await auth.verifyCode(nextPhone(), "000000");
      return {};
    });
    const res = await route(new NextRequest(URL_X, { method: "POST" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(`${TEST_SESSION_COOKIE}=`);
  });

  it("sends the session cookie a run sets before it throws", async () => {
    const route = jsonRoute("public", {}, async ({ auth }) => {
      await auth.verifyCode(nextPhone(), "000000");
      throw new AppError("conflict", "after sign-in");
    });
    const res = await route(new NextRequest(URL_X, { method: "POST" }));
    expect(res.status).toBe(409);
    expect(res.headers.get("set-cookie")).toContain(`${TEST_SESSION_COOKIE}=`);
  });
});

describe("ac-4 no phone number reaches a log on the internal-error path", () => {
  it("logs one http.internal line with only the request id and path", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    const route = jsonRoute("public", {}, async () => {
      throw new Error("db failed for +1 (555) 123-4567");
    });
    const res = await route(post("{}"));
    expect(res.status).toBe(500);
    const json = await res.json();
    const ref = refOf(json.error.message);
    expect(json).toEqual({
      error: { code: "internal", message: `Something went wrong (ref ${ref})` },
      serverNow: clock.now(),
    });

    const errors = spies[2]!;
    expect(errors).toHaveBeenCalledOnce();
    expect(JSON.parse(String(errors.mock.calls[0]![0]))).toEqual({
      level: "error",
      event: "http.internal",
      requestId: ref,
      path: "/api/x",
    });

    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => JSON.stringify(args))
      .join("\n");
    for (const fragment of [
      "5551234567",
      "555-123-4567",
      "123-4567",
      "(555) 123",
      "1234567",
    ]) {
      expect(logged).not.toContain(fragment);
    }
  });
});

describe("cross-site write refusal", () => {
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
      const res = await createJsonRoute(build)("public", {}, run)(
        new NextRequest(URL_X, {
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
    const res = await jsonRoute(
      "public",
      {},
      run,
    )(
      new NextRequest(URL_X, {
        method: "POST",
        headers: { origin: "https://coo.test" },
      }),
    );
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("allows a write with no Origin header", async () => {
    const res = await jsonRoute("public", {}, async () => ({ ok: true }))(
      new NextRequest(URL_X, { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });

  it("allows a cross-origin GET", async () => {
    const res = await jsonRoute("public", {}, async () => ({ ok: true }))(
      new NextRequest(URL_X, { headers: { origin: "https://evil.example" } }),
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
      const res = await createJsonRoute(build)("public", {}, async () => ({
        ok: true,
      }))(new NextRequest(URL_X, { method: "POST" }));
      expect(build).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: { code: "internal", message: INTERNAL },
      });
    },
  );
});

describe("input typing", () => {
  it("is undefined without a schema and the parsed type with one", async () => {
    const bare = jsonRoute("public", {}, async ({ input }) => {
      expectTypeOf(input).toEqualTypeOf<undefined>();
      return { got: input === undefined };
    });
    expect(await (await bare(new NextRequest(URL_X))).json()).toMatchObject({
      got: true,
    });

    const typed = jsonRoute(
      "public",
      { body: z.object({ n: z.number() }) },
      async ({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ n: number }>();
        return { n: input.n };
      },
    );
    expect(await (await typed(post('{"n":5}'))).json()).toMatchObject({ n: 5 });
  });
});
