import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readHandoff, saveHandoff } from "./takeoffHandoff";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("takeoff hand-off (ac-1)", () => {
  it("round-trips per visit", () => {
    saveHandoff("v1", { flightId: "f1", pronoun: "she" });
    expect(readHandoff("v1")).toEqual({ flightId: "f1", pronoun: "she" });
    expect(readHandoff("v2")).toBeNull();
  });

  it("ignores a garbled entry", () => {
    saveHandoff("v1", { flightId: "f1", pronoun: "she" });
    for (const k of store.keys()) store.set(k, "{nope");
    expect(readHandoff("v1")).toBeNull();
    for (const k of store.keys()) store.set(k, '{"flightId":1,"pronoun":"x"}');
    expect(readHandoff("v1")).toBeNull();
  });

  it("is best-effort when storage is blocked", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Quota", "QuotaExceededError");
      },
    });
    expect(() =>
      saveHandoff("v1", { flightId: "f1", pronoun: "she" }),
    ).not.toThrow();
    expect(readHandoff("v1")).toBeNull();
  });
});
