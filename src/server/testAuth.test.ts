import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { FakeClock } from "@/test/fakes/clock";
import { FakeJar } from "@/test/fakes/jar";
import { testDb } from "@/test/testDb";
import type { Db } from "./db";
import {
  TEST_SESSION_COOKIE,
  testAuth,
  testAuthEnabled,
  type TestAuthEnv,
} from "./testAuth";

const enabled: TestAuthEnv = {
  APP_ENV: "test",
  TEST_AUTH_SECRET: "test-secret-value",
};
const phone = toE164("(555) 123-4567") as E164;
const DAY = 24 * 60 * 60 * 1000;

let db: Db;
let jar: FakeJar;
let clock: FakeClock;

beforeEach(async () => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
  db = await testDb();
  jar = new FakeJar();
  clock = new FakeClock(1_800_000_000_000);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("testAuth fails closed", () => {
  it.each<[string, TestAuthEnv]>([
    ["APP_ENV is unset", { TEST_AUTH_SECRET: "s" }],
    ["APP_ENV=production", { APP_ENV: "production", TEST_AUTH_SECRET: "s" }],
    ["APP_ENV=preview", { APP_ENV: "preview", TEST_AUTH_SECRET: "s" }],
    ["APP_ENV=development", { APP_ENV: "development", TEST_AUTH_SECRET: "s" }],
    ["VERCEL_ENV=production", { ...enabled, VERCEL_ENV: "production" }],
    ["the secret is missing", { APP_ENV: "test" }],
    ["the secret is empty", { APP_ENV: "test", TEST_AUTH_SECRET: "" }],
  ])("refuses to load when %s", (_, env) => {
    expect(testAuthEnabled(env)).toBe(false);
    expect(() => testAuth(jar, env, db, clock)).toThrow(/test auth/i);
  });

  it("refuses to load when the process runs on Vercel production, whatever env it is given", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(testAuthEnabled(enabled)).toBe(false);
    expect(() => testAuth(jar, enabled, db, clock)).toThrow(/test auth/i);
  });

  it("loads only with APP_ENV=test, a secret, and no Vercel production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(testAuthEnabled({ ...enabled, VERCEL_ENV: "preview" })).toBe(true);
    expect(() =>
      testAuth(jar, { ...enabled, VERCEL_ENV: "preview" }, db, clock),
    ).not.toThrow();
  });
});

describe("testAuth sign-in", () => {
  it("accepts 000000 for a +1555 number, creates the user once, and sets an HttpOnly session", async () => {
    const auth = testAuth(jar, enabled, db, clock);
    await auth.sendCode(phone);

    const userId = await auth.verifyCode(phone, "000000");
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await auth.currentUserId()).toBe(userId);

    const session = jar.cookies.get(TEST_SESSION_COOKIE);
    expect(session?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    expect(session?.value).not.toContain("5551234567");

    const again = await testAuth(new FakeJar(), enabled, db, clock).verifyCode(
      phone,
      "000000",
    );
    expect(again).toBe(userId);
    const rows = await db.query<{ n: number }>(
      "select count(*)::int as n from auth.users",
    );
    expect(rows[0].n).toBe(1);
  });

  it("rejects a wrong code and sets no session", async () => {
    const auth = testAuth(jar, enabled, db, clock);
    expect(await auth.verifyCode(phone, "123456")).toBeNull();
    expect(jar.cookies.size).toBe(0);
    expect(await auth.currentUserId()).toBeNull();
  });

  it("rejects 000000 for a number outside +1555", async () => {
    const auth = testAuth(jar, enabled, db, clock);
    expect(
      await auth.verifyCode(toE164("(212) 555-0100") as E164, "000000"),
    ).toBeNull();
    expect(jar.cookies.size).toBe(0);
  });

  it("ignores a tampered, foreign-secret or expired session cookie", async () => {
    const auth = testAuth(jar, enabled, db, clock);
    const userId = await auth.verifyCode(phone, "000000");
    const value = jar.cookies.get(TEST_SESSION_COOKIE)!.value;

    const tampered = new FakeJar();
    tampered.setAll([
      {
        ...jar.cookies.get(TEST_SESSION_COOKIE)!,
        value: value.replace(/^./, (c) => (c === "a" ? "b" : "a")),
      },
    ]);
    expect(
      await testAuth(tampered, enabled, db, clock).currentUserId(),
    ).toBeNull();

    expect(
      await testAuth(
        jar,
        { ...enabled, TEST_AUTH_SECRET: "other" },
        db,
        clock,
      ).currentUserId(),
    ).toBeNull();

    clock.advance(31 * DAY);
    expect(await auth.currentUserId()).toBeNull();
    expect(userId).not.toBeNull();
  });

  it("signs out by clearing the session cookie", async () => {
    const auth = testAuth(jar, enabled, db, clock);
    await auth.verifyCode(phone, "000000");
    await auth.signOut();
    expect(jar.cookies.size).toBe(0);
    expect(await auth.currentUserId()).toBeNull();
  });
});

describe("testAuth never logs a phone number", () => {
  it("keeps every console write free of the number across the whole flow", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const auth = testAuth(jar, enabled, db, clock);
    const other = toE164("(212) 555-0100") as E164;

    await auth.sendCode(phone);
    await auth.verifyCode(phone, "123456");
    await auth.verifyCode(phone, "000000");
    await auth.currentUserId();
    await auth.signOut();
    await auth.sendCode(other);
    await auth.verifyCode(other, "000000");

    const written = spies.flatMap((spy) =>
      spy.mock.calls.map((args) => JSON.stringify(args)),
    );
    expect(written.length).toBeGreaterThan(0);
    for (const line of written) {
      expect(line).not.toMatch(/1234567|5550100/);
    }
  });
});
