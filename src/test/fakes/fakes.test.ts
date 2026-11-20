import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { PushError } from "@/server/ports/push";
import { SmsError } from "@/server/ports/sms";
import { FakeGeocoder } from "./geocoder";
import { FakePush } from "./push";
import { FakeSms } from "./sms";
import { FakeWeather } from "./weather";

const T0 = Date.UTC(2026, 10, 19, 15);
const queries = [
  { lat: 40.7306, lon: -73.9866, atMs: T0 },
  { lat: 39.9526, lon: -75.1652, atMs: T0 + 3_600_000 },
];
const windy = {
  windMph: 25,
  windFromDeg: 270,
  tempF: 40,
  precipMmH: 2,
  snow: false,
};
const sub = { endpoint: "https://push.example/abc", p256dh: "k", auth: "a" };
const payload = { title: "Pip", body: "Pip landed", url: "/f/1", tag: "f1" };

describe("FakeWeather", () => {
  it("returns the calm fallback for every query", async () => {
    const weather = new FakeWeather();
    expect(await weather.samples(queries)).toEqual([
      config.game.weather.fallback,
      config.game.weather.fallback,
    ]);
  });

  it("set changes what later calls return", async () => {
    const weather = new FakeWeather();
    weather.set(windy);
    expect(await weather.samples(queries)).toEqual([windy, windy]);
  });

  it("failNext rejects one call only", async () => {
    const weather = new FakeWeather();
    weather.failNext();
    await expect(weather.samples(queries)).rejects.toThrow();
    expect(await weather.samples(queries)).toHaveLength(2);
  });

  it("changing a returned sample leaves fresh fakes and config calm", async () => {
    const calm = structuredClone(config.game.weather.fallback);
    const [sample] = await new FakeWeather().samples(queries);
    sample.windMph = 99;
    expect(config.game.weather.fallback).toEqual(calm);
    expect(await new FakeWeather().samples(queries)).toEqual([calm, calm]);
  });

  it("changing a returned sample leaves the set sample", async () => {
    const weather = new FakeWeather();
    weather.set(structuredClone(windy));
    const [first] = await weather.samples(queries);
    first.windMph = 99;
    expect(await weather.samples(queries)).toEqual([windy, windy]);
  });
});

describe("FakeGeocoder", () => {
  const geocoder = new FakeGeocoder();

  it("search matches labels ignoring case", async () => {
    const hits = await geocoder.search("phil");
    expect(hits.map((h) => h.label)).toContain("Philadelphia");
    expect(hits.length).toBeLessThanOrEqual(6);
  });

  it("search with no match is empty", async () => {
    expect(await geocoder.search("nowhere")).toEqual([]);
  });

  it("reverse names the place at its coordinates", async () => {
    const name = await geocoder.reverse(39.9526, -75.1652);
    expect(name?.city).toBe("Philadelphia");
    expect(name?.stateCode).toBe("PA");
  });

  it("reverse far from every place is null", async () => {
    expect(await geocoder.reverse(38, -50)).toBeNull();
  });

  it("changing a returned hit leaves the table", async () => {
    const [hit] = await new FakeGeocoder().search("Philadelphia");
    const original = structuredClone(hit);
    hit.label = "changed";
    expect(await new FakeGeocoder().search("Philadelphia")).toEqual([original]);
  });

  it("changing a returned name leaves the table", async () => {
    const name = await new FakeGeocoder().reverse(39.9526, -75.1652);
    if (!name) throw new Error("no place at Philadelphia");
    const original = structuredClone(name);
    name.city = "changed";
    expect(await new FakeGeocoder().reverse(39.9526, -75.1652)).toEqual(
      original,
    );
  });
});

describe("FakePush", () => {
  it("records each send", async () => {
    const push = new FakePush();
    await push.send(sub, payload);
    expect(push.sent).toEqual([{ sub, payload }]);
  });

  it("failNext throws PushError once and records nothing", async () => {
    const push = new FakePush();
    push.failNext(410);
    const err = await push.send(sub, payload).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PushError);
    expect((err as PushError).status).toBe(410);
    expect(push.sent).toEqual([]);
    await push.send(sub, payload);
    expect(push.sent).toHaveLength(1);
  });
});

describe("FakeSms", () => {
  it("records each send", async () => {
    const sms = new FakeSms();
    await sms.send("+15555550100", "Pip landed");
    expect(sms.sent).toEqual([{ to: "+15555550100", body: "Pip landed" }]);
  });

  it("failNext throws SmsError once and records nothing", async () => {
    const sms = new FakeSms();
    sms.failNext(21610);
    const err = await sms.send("+15555550100", "hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SmsError);
    expect((err as SmsError).code).toBe(21610);
    expect(sms.sent).toEqual([]);
    await sms.send("+15555550100", "hi");
    expect(sms.sent).toHaveLength(1);
  });
});
