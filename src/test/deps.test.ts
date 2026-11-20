import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { authFor, makeDeps } from "@/server/deps";
import { toE164, type E164 } from "@/lib/phone";
import { testDb } from "./testDb";
import { FakeJar } from "./fakes/jar";
import { makeTestDeps } from "./deps";
import { FakeClock } from "./fakes/clock";
import { FakeGeocoder } from "./fakes/geocoder";
import { FakePush } from "./fakes/push";
import { FakeSms } from "./fakes/sms";
import { FakeWeather } from "./fakes/weather";

const KEYS = [
  "auth",
  "clock",
  "config",
  "db",
  "geocoder",
  "push",
  "sms",
  "weather",
];

describe("makeTestDeps", () => {
  it("builds every dependency from the fakes and testDb", async () => {
    const deps = await makeTestDeps();
    expect(Object.keys(deps).sort()).toEqual(KEYS);
    expect(await deps.db.query("select 1 as one")).toEqual([{ one: 1 }]);
    expect(deps.clock).toBeInstanceOf(FakeClock);
    expect(deps.weather).toBeInstanceOf(FakeWeather);
    expect(deps.geocoder).toBeInstanceOf(FakeGeocoder);
    expect(deps.push).toBeInstanceOf(FakePush);
    expect(deps.sms).toBeInstanceOf(FakeSms);
    const before = deps.clock.now();
    deps.clock.advance(1000);
    expect(deps.clock.now()).toBe(before + 1000);
  });

  it("an override replaces only its key", async () => {
    const clock = new FakeClock(0);
    const deps = await makeTestDeps({ clock });
    expect(deps.clock).toBe(clock);
    expect(deps.weather).toBeInstanceOf(FakeWeather);
  });
});

const phone = toE164("(555) 123-4567") as E164;

describe("makeTestDeps auth", () => {
  it("signs a user in with the test code against its own db and clock", async () => {
    const deps = await makeTestDeps();
    const jar = new FakeJar();
    const id = await deps.auth(jar).verifyCode(phone, "000000");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await deps.auth(jar).currentUserId()).toBe(id);
    deps.clock.advance(31 * 24 * 60 * 60 * 1000);
    expect(await deps.auth(jar).currentUserId()).toBeNull();
  });
});

describe("authFor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const supabase = {
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  };

  it("picks test auth when APP_ENV is test", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("tests must not call the network");
    });
    const db = await testDb();
    const jar = new FakeJar();
    const env = {
      ...supabase,
      APP_ENV: "test",
      TEST_AUTH_SECRET: "secret",
    } as const;
    const id = await authFor(jar, env, db, new FakeClock(0)).verifyCode(
      phone,
      "000000",
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("still fails closed when APP_ENV is test without a secret", async () => {
    const db = await testDb();
    const env = { ...supabase, APP_ENV: "test" } as const;
    expect(() => authFor(new FakeJar(), env, db, new FakeClock(0))).toThrow(
      /test auth is disabled/,
    );
  });

  it.each(["production", "preview", "development"] as const)(
    "picks Supabase when APP_ENV is %s, even with a test secret",
    async (appEnv) => {
      vi.stubEnv("APP_ENV", appEnv);
      const calls: string[] = [];
      vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
        calls.push(String(input instanceof Request ? input.url : input));
        return Response.json({});
      });
      const db = await testDb();
      const env = { ...supabase, APP_ENV: appEnv, TEST_AUTH_SECRET: "secret" };
      await authFor(new FakeJar(), env, db, new FakeClock(0)).sendCode(phone);
      expect(calls).toEqual([
        expect.stringMatching(
          /^https:\/\/project\.supabase\.co\/auth\/v1\/otp/,
        ),
      ]);
    },
  );
});

describe("makeDeps", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("wires the ports not built yet to reject with an internal AppError", async () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:1/none",
      CRON_SECRET: "cron",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "vapid-public",
      VAPID_PRIVATE_KEY: "vapid-private",
      VAPID_SUBJECT: "mailto:ops@example.com",
      TWILIO_ACCOUNT_SID: "sid",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_FROM: "+15555550100",
      LINK_TOKEN_PEPPER: "pepper",
      APP_ENV: "production",
    };
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

    const deps = await makeDeps();
    expect(Object.keys(deps).sort()).toEqual(KEYS);
    const sub = { endpoint: "https://push.example/x", p256dh: "k", auth: "a" };
    const payload = { title: "t", body: "b", url: "/", tag: "x" };
    for (const call of [
      () => deps.push.send(sub, payload),
      () => deps.sms.send("+15555550100", "hi"),
    ]) {
      const err = await call().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("internal");
    }
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "test" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("production code", () => {
  it("never imports src/test", () => {
    const src = join(process.cwd(), "src");
    const offenders = sourceFiles(src).filter((file) =>
      /from\s+["'](@\/test\/|(\.\.?\/)+test\/)/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders.map((f) => relative(src, f))).toEqual([]);
  });
});
