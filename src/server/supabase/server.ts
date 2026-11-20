import { createServerClient } from "@supabase/ssr";
import type { AuthError } from "@supabase/supabase-js";
import type { Env } from "@/env";
import { AppError, type ErrorCode } from "../errors";
import { log } from "../log";
import type { AuthPort, SessionJar, UserId } from "../ports/auth";
import { toJarOptions } from "./cookies";

type Op = "sendCode" | "verifyCode" | "signOut";
type Outcome = Extract<ErrorCode, "rate_limited" | "invalid" | "internal">;

const MESSAGES: Record<Outcome, string> = {
  rate_limited: "Too many attempts. Try again later.",
  invalid: "That phone number cannot get a code.",
  internal: "Sign-in is unavailable right now.",
};

const OUTCOMES: Record<Exclude<Op, "signOut">, (status: number) => Outcome | "rejected"> = {
  sendCode: (status) =>
    status === 429
      ? "rate_limited"
      : status === 400 || status === 422
        ? "invalid"
        : "internal",
  verifyCode: (status) =>
    status === 429
      ? "rate_limited"
      : status >= 400 && status < 500
        ? "rejected"
        : "internal",
};

function logFailure(op: Op, error: AuthError, level: "warn" | "error") {
  log[level]("auth.supabase_failed", {
    adapter: "supabase",
    op,
    status: error.status ?? 0,
    code: error.code ?? "unknown",
  });
}

const ERROR_CODE = /^[a-z0-9_]+$/;
const API_VERSION = "x-supabase-api-version";

async function errorCodes(response: Response): Promise<Record<string, string>> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null) return {};
  return Object.fromEntries(
    Object.entries(body).filter(
      ([key, value]) =>
        (key === "code" || key === "error_code") &&
        typeof value === "string" &&
        ERROR_CODE.test(value),
    ),
  );
}

function withoutErrorText(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.ok) return response;
    return Response.json(
      { msg: `HTTP ${response.status}`, ...(await errorCodes(response)) },
      {
        status: response.status,
        headers: Object.fromEntries(
          [...response.headers].filter(([name]) => name === API_VERSION),
        ),
      },
    );
  };
}

function fail(op: Exclude<Op, "signOut">, error: AuthError) {
  const outcome = OUTCOMES[op](error.status ?? 0);
  logFailure(op, error, outcome === "internal" ? "error" : "warn");
  if (outcome === "rejected") return;
  throw new AppError(outcome, MESSAGES[outcome]);
}

export function supabaseAuth(
  jar: SessionJar,
  env: Pick<Env, "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY">,
  fetchImpl: typeof fetch = fetch,
): AuthPort {
  const { auth } = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (cookies, headers) =>
          jar.setAll(
            cookies.map(({ name, value, options }) => ({
              name,
              value,
              options: toJarOptions(options),
            })),
            headers,
          ),
      },
      cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
      global: { fetch: withoutErrorText(fetchImpl) },
    },
  );

  return {
    async sendCode(phone) {
      const { error } = await auth.signInWithOtp({ phone });
      if (error) fail("sendCode", error);
    },

    async verifyCode(phone, code) {
      const { data, error } = await auth.verifyOtp({
        phone,
        token: code,
        type: "sms",
      });
      if (error) {
        fail("verifyCode", error);
        return null;
      }
      return data.user ? (data.user.id as UserId) : null;
    },

    async currentUserId() {
      try {
        const { data, error } = await auth.getClaims();
        return error || !data ? null : (data.claims.sub as UserId);
      } catch {
        return null;
      }
    },

    async signOut() {
      const { error } = await auth.signOut();
      if (!error) return;
      logFailure("signOut", error, "warn");
      const local = await auth.signOut({ scope: "local" });
      if (local.error) logFailure("signOut", local.error, "error");
    },
  };
}
