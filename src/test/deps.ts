import { config } from "@/lib/config";
import type { Deps } from "@/server/deps";
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
  return {
    db: overrides.db ?? (await testDb()),
    clock: new FakeClock(Date.UTC(2026, 10, 19, 15)),
    weather: new FakeWeather(),
    geocoder: new FakeGeocoder(),
    push: new FakePush(),
    sms: new FakeSms(),
    config,
    ...overrides,
  };
}
