import { config } from "@/lib/config";
import type { Deps } from "@/server/deps";
import { testAuth } from "@/server/testAuth";
import { FakeClock } from "./fakes/clock";
import { FakeGeocoder } from "./fakes/geocoder";
import { FakePush } from "./fakes/push";
import { FakeSms } from "./fakes/sms";
import { FakeWeather } from "./fakes/weather";
import { testDb } from "./testDb";

export interface TestDeps extends Deps {
  clock: FakeClock;
  weather: FakeWeather;
  geocoder: FakeGeocoder;
  push: FakePush;
  sms: FakeSms;
}

export async function makeTestDeps(
  overrides: Partial<TestDeps> = {},
): Promise<TestDeps> {
  const db = overrides.db ?? (await testDb());
  const clock = overrides.clock ?? new FakeClock(Date.UTC(2026, 10, 19, 15));
  return {
    db,
    clock,
    auth: (jar) =>
      testAuth(
        jar,
        { APP_ENV: "test", TEST_AUTH_SECRET: "test-auth-secret" },
        db,
        clock,
      ),
    weather: new FakeWeather(),
    geocoder: new FakeGeocoder(),
    push: new FakePush(),
    sms: new FakeSms(),
    config,
    ...overrides,
  };
}
