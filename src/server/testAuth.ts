import type { Clock } from "./clock";
import type { Db } from "./db";
import { log } from "./log";
import type { AuthPort, SessionJar, JarOptions, UserId } from "./ports/auth";

export type TestAuthEnv = {
  APP_ENV?: string;
  VERCEL_ENV?: string;
  TEST_AUTH_SECRET?: string;
};

export const TEST_SESSION_COOKIE = "coo_test_session";
const TEST_CODE = "000000";
const TEST_PREFIX = "+1555";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_OPTIONS: JarOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_SECONDS,
};

export function testAuthEnabled(
  env: TestAuthEnv,
): env is TestAuthEnv & { TEST_AUTH_SECRET: string } {
  return (
    env.APP_ENV === "test" &&
    process.env.APP_ENV === "test" &&
    env.VERCEL_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production" &&
    !!env.TEST_AUTH_SECRET
  );
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function testAuth(
  jar: SessionJar,
  env: TestAuthEnv,
  db: Db,
  clock: Clock,
): AuthPort {
  if (!testAuthEnabled(env)) {
    throw new Error(
      "test auth is disabled: it needs APP_ENV=test, TEST_AUTH_SECRET and no Vercel production",
    );
  }
  const key = hmacKey(env.TEST_AUTH_SECRET);

  async function sign(payload: string): Promise<string> {
    const sig = await crypto.subtle.sign(
      "HMAC",
      await key,
      new TextEncoder().encode(payload),
    );
    return Buffer.from(sig).toString("base64url");
  }

  async function verified(value: string): Promise<UserId | null> {
    const match = /^([0-9a-f-]{36})\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(value);
    if (!match) return null;
    const [, userId, expiresAt, sig] = match;
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key,
      Buffer.from(sig, "base64url"),
      new TextEncoder().encode(`${userId}.${expiresAt}`),
    );
    return ok && Number(expiresAt) > clock.now() ? (userId as UserId) : null;
  }

  return {
    async sendCode() {
      log.info("auth.code_sent", { adapter: "test" });
    },

    async verifyCode(phone, code) {
      if (code !== TEST_CODE || !phone.startsWith(TEST_PREFIX)) {
        log.info("auth.code_rejected", { adapter: "test" });
        return null;
      }
      const [{ id }] = await db.query<{ id: UserId }>(
        `insert into auth.users (phone) values ($1)
         on conflict (phone) do update set phone = excluded.phone
         returning id`,
        [phone.slice(1)],
      );
      const payload = `${id}.${clock.now() + SESSION_SECONDS * 1000}`;
      jar.setAll([
        {
          name: TEST_SESSION_COOKIE,
          value: `${payload}.${await sign(payload)}`,
          options: COOKIE_OPTIONS,
        },
      ]);
      return id;
    },

    async currentUserId() {
      const cookie = jar.getAll().find((c) => c.name === TEST_SESSION_COOKIE);
      return cookie ? verified(cookie.value) : null;
    },

    async signOut() {
      jar.setAll([
        {
          name: TEST_SESSION_COOKIE,
          value: "",
          options: { ...COOKIE_OPTIONS, maxAge: 0 },
        },
      ]);
    },
  };
}
