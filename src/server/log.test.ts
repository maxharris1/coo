import { afterEach, describe, expect, it, vi } from "vitest";
import { log, redact } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("redact", () => {
  it.each([
    "+15551234567",
    "call 5551234567 now",
    "(555) 123-4567",
    "+1 555 123 4567",
    "555.123.4567",
    "123-4567",
  ])("removes the phone number from %j", (text) => {
    const out = redact(text);
    expect(out).not.toMatch(/\d{4}/);
    expect(out).toContain("[redacted]");
  });

  it("keeps short numbers", () => {
    expect(redact("retry 3 of 5, status 429")).toBe("retry 3 of 5, status 429");
  });
});

describe("log", () => {
  it("writes one JSON line per call at the matching level", () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    log.info("auth.code_sent", { adapter: "test" });
    log.warn("auth.slow", { ms: 1200 });
    log.error("auth.failed", { status: 500 });

    expect(JSON.parse(info.mock.calls[0][0])).toEqual({
      level: "info",
      event: "auth.code_sent",
      adapter: "test",
    });
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
      level: "warn",
      ms: 1200,
    });
    expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
      level: "error",
      status: 500,
    });
  });

  it("redacts phone numbers in strings, numbers, nested fields and errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    log.error("auth.failed +15551234567", {
      phone: "+15551234567",
      raw: 5551234567,
      nested: { list: ["(555) 123-4567"] },
      err: new Error("duplicate key (phone)=(15551234567)"),
    });

    const line = error.mock.calls[0][0] as string;
    expect(line).not.toMatch(/1234567|123-4567/);
    const parsed = JSON.parse(line);
    expect(parsed.err.message).toContain("duplicate key");
    expect(parsed.raw).toBe("[redacted]");
  });
});
