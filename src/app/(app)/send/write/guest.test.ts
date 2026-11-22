import { describe, expect, it } from "vitest";
import { pinKey, readGuest, writePin } from "./guest";

const params = (query: string) => new URLSearchParams(query);

const storing = (entries: Record<string, string>) => ({
  getItem: (key: string) => entries[key] ?? null,
});

const EMPTY = storing({});

describe("readGuest", () => {
  it("reads the guest's name and place without a pin", () => {
    expect(readGuest(params("guest=Maya&place=p1"), EMPTY)).toStrictEqual({
      name: "Maya",
      placeId: "p1",
    });
  });

  it("trims the guest's name", () => {
    expect(readGuest(params("guest=%20Maya%20&place=p1"), EMPTY)).toStrictEqual(
      { name: "Maya", placeId: "p1" },
    );
  });

  it("reads the exact pin stored under the place", () => {
    const pin = { lat: 40.712345678, lon: -74.006012345 };
    const storage = storing({ [pinKey("p1")]: JSON.stringify(pin) });
    expect(readGuest(params("guest=Maya&place=p1"), storage)).toStrictEqual({
      name: "Maya",
      placeId: "p1",
      pin,
    });
  });

  it("ignores a pin stored under another place", () => {
    const storage = storing({
      [pinKey("p2")]: JSON.stringify({ lat: 40.7, lon: -74 }),
    });
    expect(readGuest(params("guest=Maya&place=p1"), storage)).toStrictEqual({
      name: "Maya",
      placeId: "p1",
    });
  });

  it.each([
    ["malformed JSON", "{lat:"],
    ["a missing lon", JSON.stringify({ lat: 40.7 })],
    ["a string lat", JSON.stringify({ lat: "40.7", lon: -74 })],
    ["a lat past the pole", JSON.stringify({ lat: 91, lon: -74 })],
    ["a lon past the antimeridian", JSON.stringify({ lat: 40.7, lon: -181 })],
    ["null", "null"],
    ["a number", "7"],
  ])("drops a pin with %s", (_, raw) => {
    const storage = storing({ [pinKey("p1")]: raw });
    expect(readGuest(params("guest=Maya&place=p1"), storage)).toStrictEqual({
      name: "Maya",
      placeId: "p1",
    });
  });

  it("keeps the guest without a pin when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(readGuest(params("guest=Maya&place=p1"), storage)).toStrictEqual({
      name: "Maya",
      placeId: "p1",
    });
  });

  it.each([
    ["no name", "place=p1"],
    ["a blank name", "guest=%20%20&place=p1"],
    ["no place", "guest=Maya"],
    ["an empty place", "guest=Maya&place="],
    ["nothing", ""],
  ])("is no guest with %s", (_, query) => {
    expect(readGuest(params(query), EMPTY)).toBeNull();
  });
});

describe("writePin", () => {
  const memory = () => {
    const entries: Record<string, string> = {};
    return {
      entries,
      getItem: (key: string) => entries[key] ?? null,
      setItem: (key: string, value: string) => void (entries[key] = value),
      removeItem: (key: string) => void delete entries[key],
    };
  };

  it("stores the exact pin where compose reads it", () => {
    const storage = memory();
    const pin = { lat: 40.712345678, lon: -74.006012345 };
    writePin(storage, "p1", pin);
    expect(readGuest(params("guest=Maya&place=p1"), storage)).toStrictEqual({
      name: "Maya",
      placeId: "p1",
      pin,
    });
  });

  it("forgets the pin when there is none", () => {
    const storage = memory();
    writePin(storage, "p1", { lat: 40.7, lon: -74 });
    writePin(storage, "p1", null);
    expect(storage.entries).toStrictEqual({});
  });
});
