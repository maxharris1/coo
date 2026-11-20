import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import type { WeatherSample } from "@/lib/flight/engine";
import type { Deps } from "@/server/deps";
import type { Weather, WeatherQuery } from "@/server/ports/weather";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { sampleWeather } from "./weather";

const QUERIES: WeatherQuery[] = [
  { lat: 40.7081, lon: -73.9571, atMs: Date.UTC(2026, 10, 19, 15) },
  { lat: 40.7081, lon: -73.9571, atMs: Date.UTC(2026, 10, 19, 16) },
  { lat: 40.7081, lon: -73.9571, atMs: Date.UTC(2026, 10, 19, 17) },
];

const STORM: WeatherSample = {
  windMph: 18,
  windFromDeg: 270,
  tempF: 41,
  precipMmH: 6,
  snow: false,
};

let deps: TestDeps;
let warn: MockInstance<typeof console.warn>;

beforeEach(async () => {
  deps = await makeTestDeps();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function withPort(samples: Weather["samples"]): Deps {
  return { ...deps, weather: { samples } };
}

function fallbacks(n: number): WeatherSample[] {
  return Array.from({ length: n }, () => deps.config.game.weather.fallback);
}

describe("sampleWeather (ac-3)", () => {
  it("returns the port's samples when it answers in time", async () => {
    deps.weather.set(STORM);

    await expect(sampleWeather(deps, QUERIES)).resolves.toEqual({
      samples: [STORM, STORM, STORM],
      fallback: false,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns the config fallback for every query when the port fails", async () => {
    deps.weather.set(STORM);
    deps.weather.failNext();

    await expect(sampleWeather(deps, QUERIES)).resolves.toEqual({
      samples: fallbacks(3),
      fallback: true,
    });
  });

  it("falls back at 2 s when the port never answers", async () => {
    const slow = withPort(() => new Promise(() => {}));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    let settled = false;
    const result = sampleWeather(slow, QUERIES).finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({
      samples: fallbacks(3),
      fallback: true,
    });
  });

  it("falls back when the port answers after the deadline", async () => {
    const late = withPort(
      (at) =>
        new Promise((resolve) =>
          setTimeout(() => resolve(at.map(() => STORM)), 2500),
        ),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const result = sampleWeather(late, QUERIES);
    await vi.advanceTimersByTimeAsync(2500);

    await expect(result).resolves.toEqual({
      samples: fallbacks(3),
      fallback: true,
    });
  });

  it("falls back when the port throws synchronously", async () => {
    const broken = withPort(() => {
      throw new Error("weather adapter crashed");
    });

    await expect(sampleWeather(broken, QUERIES)).resolves.toEqual({
      samples: fallbacks(3),
      fallback: true,
    });
  });

  it("falls back when the port answers the wrong number of samples", async () => {
    const short = withPort(async () => [STORM]);

    await expect(sampleWeather(short, QUERIES)).resolves.toEqual({
      samples: fallbacks(3),
      fallback: true,
    });
  });

  it("hands out fallback copies that do not share state with config", async () => {
    const before = structuredClone(deps.config.game.weather.fallback);
    deps.weather.failNext();

    const { samples } = await sampleWeather(deps, QUERIES);
    samples[0].windMph = 99;

    expect(deps.config.game.weather.fallback).toEqual(before);
    expect(samples[1]).toEqual(before);
  });

  it("logs the fallback without the query coordinates", async () => {
    deps.weather.failNext();

    await sampleWeather(deps, QUERIES);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({
      level: "warn",
      event: "weather.fallback",
      reason: "weather unavailable",
    });
    expect(line).not.toMatch(/40\.708|73\.957/);
  });

  function throwing(): never {
    throw new Error("boom");
  }

  it.each([
    ["a null-prototype object", () => Object.create(null)],
    ["null", () => null],
    ["undefined", () => undefined],
    ["an object whose toString throws", () => ({ toString: throwing })],
    [
      "an object whose Symbol.toPrimitive throws",
      () => ({ [Symbol.toPrimitive]: throwing }),
    ],
    [
      "an Error whose message getter throws",
      () => Object.defineProperty(new Error(), "message", { get: throwing }),
    ],
    [
      "a Proxy whose getPrototypeOf trap throws",
      () => new Proxy({}, { getPrototypeOf: throwing }),
    ],
  ])("falls back when the port rejects with %s", async (_, rejection) => {
    const broken = withPort(() => Promise.reject(rejection()));

    await expect(sampleWeather(broken, QUERIES.slice(0, 1))).resolves.toEqual({
      samples: fallbacks(1),
      fallback: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("redacts coordinates from the port's error message", async () => {
    const broken = withPort(() =>
      Promise.reject(new Error("no data at 40.7081,-73.9571")),
    );

    await sampleWeather(broken, QUERIES);

    const line = String(warn.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({
      event: "weather.fallback",
      errorType: "Error",
    });
    expect(line).not.toMatch(/40\.708|73\.957/);
  });
});
