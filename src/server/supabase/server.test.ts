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

type Reply = { status: number; body: unknown };
type Routes = Partial<Record<"otp" | "verify" | "logout" | "token", Reply>>;

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
      headers: { "content-type": "application/json" },
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
    spy.mock.calls.map((args) =>
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" "),
    ),
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
