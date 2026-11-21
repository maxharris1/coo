import { afterEach, expect, it, vi } from "vitest";

const { offset } = vi.hoisted(() => ({ offset: { ms: 0 } }));

vi.mock("@/env", () => ({
  getEnv: () => ({
    APP_ENV: "development",
    GEOCODER_URL: "https://geocoder.test",
    WEATHER_URL: "https://weather.test",
    VAPID_SUBJECT: "mailto:dev@coo.test",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public",
    VAPID_PRIVATE_KEY: "private",
  }),
}));
vi.mock("./db", () => ({
  getDb: () => ({ query: async () => [{ offset_ms: offset.ms }] }),
}));
vi.mock("./adapters/webPush", () => ({ webPush: () => ({}) }));

import { makeDeps } from "./deps";

afterEach(() => vi.restoreAllMocks());

it("keeps the cached offset unless asked for fresh deps", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  expect((await makeDeps()).clock.now()).toBe(1_000_000);
  offset.ms = 3_600_000;
  expect((await makeDeps()).clock.now()).toBe(1_000_000);
  expect((await makeDeps({ fresh: true })).clock.now()).toBe(4_600_000);
  expect((await makeDeps()).clock.now()).toBe(4_600_000);
});
