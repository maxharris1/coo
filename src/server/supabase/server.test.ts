import { format } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { AppError } from "@/server/errors";
import { FakeJar } from "@/test/fakes/jar";
import { supabaseAuth } from "./server";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};
const phone = toE164("+15551234567") as E164;
const PHONE_FRAGMENTS = ["5551234567", "555-123-4567", "1234567"];
const USER_ID = "8f0e7c52-4a8b-4f43-9d0c-1f2e3d4c5b6a";

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
type Routes = Partial<Record<"otp" | "verify" | "logout" | "token" | "user", Reply>>;

function echoingError(status: number, code: string): Reply {
  return {
    status,
    body: {
      code: status,
      error_code: code,
      msg: `failed for ${phone}`,
      message: `failed for ${phone}`,
      error_description: `failed for ${phone}`,
    },
  };
}

function fakeFetch(routes: Routes): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const route = url.pathname.replace("/auth/v1/", "") as keyof Routes;
    const reply = routes[route];
    if (!reply) throw new Error(`unexpected request to ${url.pathname}`);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  };
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const FAR_FUTURE = 4_102_444_800;
const session = {
  access_token: `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({
    sub: USER_ID,
    exp: FAR_FUTURE,
    aud: "authenticated",
    role: "authenticated",
  })}.c2ln`,
  refresh_token: "refresh-token",
  expires_in: 3600,
  expires_at: FAR_FUTURE,
  token_type: "bearer",
  user: {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    phone: "15551234567",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  },
};

let jar: FakeJar;
let consoleSpies: { mock: { calls: unknown[][] } }[];

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
  jar = new FakeJar();
  consoleSpies = (["log", "warn", "error", "info", "debug"] as const).map(
    (method) => vi.spyOn(console, method).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function loggedLines(): string[] {
  return consoleSpies.flatMap((spy) =>
    spy.mock.calls.map((args) => format(...args)),
  );
}

function expectNoPhone(text: string) {
  for (const fragment of PHONE_FRAGMENTS) expect(text).not.toContain(fragment);
}

async function caught(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("supabaseAuth error paths never leak the phone", () => {
  it("throws rate_limited when sending a code is rate limited", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ otp: echoingError(429, "over_sms_send_rate_limit") }),
    );
    const error = await caught(auth.sendCode(phone));
    expect(error.code).toBe("rate_limited");
    expectNoPhone(error.message);
    loggedLines().forEach(expectNoPhone);
  });

  it("throws invalid when Supabase rejects the phone", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ otp: echoingError(400, "validation_failed") }),
    );
    const error = await caught(auth.sendCode(phone));
    expect(error.code).toBe("invalid");
    expectNoPhone(error.message);
    loggedLines().forEach(expectNoPhone);
  });

  it("returns null for an expired code", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ verify: echoingError(403, "otp_expired") }),
    );
    await expect(auth.verifyCode(phone, "123456")).resolves.toBeNull();
    loggedLines().forEach(expectNoPhone);
  });

  it("throws rate_limited when verifying is rate limited", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ verify: echoingError(429, "over_request_rate_limit") }),
    );
    const error = await caught(auth.verifyCode(phone, "123456"));
    expect(error.code).toBe("rate_limited");
    expectNoPhone(error.message);
    loggedLines().forEach(expectNoPhone);
  });

  it("logs only the op, status and Supabase code on an error path", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ verify: echoingError(403, "otp_expired") }),
    );
    await auth.verifyCode(phone, "123456");
    const lines = loggedLines().map((line) => JSON.parse(line));
    expect(lines).toEqual([
      {
        level: "warn",
        event: "auth.supabase_failed",
        adapter: "supabase",
        op: "verifyCode",
        status: 403,
        code: "otp_expired",
      },
    ]);
  });

  it("throws internal when Supabase is down", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ otp: echoingError(500, "unexpected_failure") }),
    );
    const error = await caught(auth.sendCode(phone));
    expect(error.code).toBe("internal");
    loggedLines().forEach(expectNoPhone);
  });
});

describe("supabaseAuth sessions", () => {
  it("returns the user id and stores HttpOnly session cookies on a good code", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ verify: { status: 200, body: session } }),
    );
    await expect(auth.verifyCode(phone, "123456")).resolves.toBe(USER_ID);

    const cookies = [...jar.cookies.values()].filter((c) =>
      /^sb-.+-auth-token/.test(c.name),
    );
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie.options).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      });
    }
    expect(jar.headers["cache-control"] ?? jar.headers["Cache-Control"]).toMatch(
      /no-store/,
    );
  });

  it("has no current user with an empty jar", async () => {
    const auth = supabaseAuth(jar, env, fakeFetch({}));
    await expect(auth.currentUserId()).resolves.toBeNull();
  });

  it("hands out the session's access token", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({
        verify: { status: 200, body: session },
        user: { status: 200, body: session.user },
      }),
    );
    await auth.verifyCode(phone, "123456");
    await expect(auth.accessToken()).resolves.toBe(session.access_token);
  });

  it("has no access token when the auth server rejects the session", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({
        verify: { status: 200, body: session },
        user: echoingError(401, "bad_jwt"),
      }),
    );
    await auth.verifyCode(phone, "123456");
    await expect(auth.accessToken()).resolves.toBeNull();
  });

  it("has no access token with an empty jar", async () => {
    const auth = supabaseAuth(jar, env, fakeFetch({}));
    await expect(auth.accessToken()).resolves.toBeNull();
  });

  it("clears the session cookies even when the logout call fails", async () => {
    await supabaseAuth(
      jar,
      env,
      fakeFetch({ verify: { status: 200, body: session } }),
    ).verifyCode(phone, "123456");
    expect(jar.getAll().some((c) => c.name.startsWith("sb-"))).toBe(true);

    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ logout: { status: 500, body: { msg: "down" } } }),
    );
    await auth.signOut();
    expect(jar.getAll().some((c) => c.name.startsWith("sb-"))).toBe(false);
  });
});

function sessionCookie(exp: number, header: string) {
  const access = `${header}.${base64url({ ...session, sub: USER_ID, exp })}.c2ln`;
  jar.setAll([
    {
      name: "sb-example-auth-token",
      value: `base64-${base64url({ ...session, access_token: access, expires_at: exp })}`,
      options: {},
    },
  ]);
}

const GOOD_HEADER = base64url({ alg: "HS256", typ: "JWT" });

function textReply(status: number): typeof fetch {
  return async () => new Response(`${phone} rejected`, { status });
}

describe("supabaseAuth SDK-owned logging never leaks the phone", () => {
  for (const op of ["currentUserId", "signOut"] as const) {
    it.each([429, 400, 403])(
      `${op} with an expired session and a %s refresh logs no phone`,
      async (status) => {
        sessionCookie(1, GOOD_HEADER);
        const auth = supabaseAuth(
          jar,
          env,
          fakeFetch({
            token: echoingError(status, "refresh_token_not_found"),
            logout: echoingError(status, "refresh_token_not_found"),
          }),
        );
        await auth[op]();
        loggedLines().forEach(expectNoPhone);
      },
    );
  }

  it.each([400, 429])(
    "a %s non-JSON refresh body echoing the phone never reaches a log",
    async (status) => {
      sessionCookie(1, GOOD_HEADER);
      await supabaseAuth(jar, env, textReply(status)).currentUserId();
      loggedLines().forEach(expectNoPhone);
    },
  );

  it.each([400, 429, 503])(
    "a %s non-JSON send-code body echoing the phone never reaches a log or error",
    async (status) => {
      const auth = supabaseAuth(jar, env, textReply(status));
      const error = await caught(auth.sendCode(phone));
      expectNoPhone(error.message);
      loggedLines().forEach(expectNoPhone);
    },
  );

  describe("a provider error code that carries a phone", () => {
    const PHONE_CODE = "phone_12025550173";
    const phoneCode = (status: number): Reply => ({
      status,
      headers: { "x-supabase-api-version": "2024-01-01" },
      body: { message: "+12025550173", code: PHONE_CODE, error_code: PHONE_CODE },
    });

    it.each([429, 400, 403])(
      "never reaches a log on a %s session refresh",
      async (status) => {
        sessionCookie(1, GOOD_HEADER);
        const auth = supabaseAuth(
          jar,
          env,
          fakeFetch({ token: phoneCode(status), logout: phoneCode(status) }),
        );
        await auth.currentUserId();
        await auth.signOut();
        expect(loggedLines().join("\n")).not.toContain("12025550173");
      },
    );

    it.each([429, 400, 403])(
      "never reaches the error or a log when a %s send-code fails",
      async (status) => {
        const auth = supabaseAuth(jar, env, fakeFetch({ otp: phoneCode(status) }));
        const error = await caught(auth.sendCode(phone));
        expect(JSON.stringify(error)).not.toContain("12025550173");
        expect(error.message).not.toContain("12025550173");
        expect(loggedLines().join("\n")).not.toContain("12025550173");
      },
    );

    it("is logged as unknown when verifying fails", async () => {
      const auth = supabaseAuth(jar, env, fakeFetch({ verify: phoneCode(403) }));
      await auth.verifyCode(phone, "123456");
      expect(loggedLines().map((line) => JSON.parse(line))).toEqual([
        expect.objectContaining({ op: "verifyCode", status: 403, code: "unknown" }),
      ]);
    });
  });

  it("keeps the Supabase error code after redacting the body", async () => {
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ verify: echoingError(403, "otp_expired") }),
    );
    await auth.verifyCode(phone, "123456");
    expect(JSON.parse(loggedLines()[0])).toMatchObject({ code: "otp_expired" });
  });
});

describe("supabaseAuth with a corrupted session cookie", () => {
  const BAD_HEADER = Buffer.from("{not json").toString("base64url");

  it("has no current user", async () => {
    sessionCookie(FAR_FUTURE, BAD_HEADER);
    const auth = supabaseAuth(jar, env, fakeFetch({}));
    await expect(auth.currentUserId()).resolves.toBeNull();
  });

  it("still clears the session cookies on sign-out", async () => {
    sessionCookie(FAR_FUTURE, BAD_HEADER);
    const auth = supabaseAuth(
      jar,
      env,
      fakeFetch({ logout: { status: 204, body: {} } }),
    );
    await auth.signOut();
    expect(jar.getAll().some((c) => c.name.startsWith("sb-"))).toBe(false);
  });
});
