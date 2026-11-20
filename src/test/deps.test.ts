import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { makeDeps } from "@/server/deps";
import { makeTestDeps } from "./deps";
import { FakeClock } from "./fakes/clock";
import { FakeGeocoder } from "./fakes/geocoder";
import { FakePush } from "./fakes/push";
import { FakeSms } from "./fakes/sms";
import { FakeWeather } from "./fakes/weather";

const KEYS = ["clock", "config", "db", "geocoder", "push", "sms", "weather"];

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

describe("makeDeps", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("wires ports that reject with an internal AppError", async () => {
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
      () => deps.weather.samples([]),
      () => deps.geocoder.search("x"),
      () => deps.geocoder.reverse(0, 0),
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
