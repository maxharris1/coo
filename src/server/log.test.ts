import { afterEach, describe, expect, it, vi } from "vitest";
import { toE164 } from "@/lib/phone";
import { log, redact } from "./log";

const ACCEPTED_PHONES = [
  "+1   555   123   4567",
  "+1\t555\t123\t4567",
  "+ 1 (555) 123 - 4567",
  "1 - 555 - 123 - 4567",
  "(555)  123--4567",
  "5 5 5 1 2 3 4 5 6 7",
  "555..123..4567",
  "+44 20 7946 0958",
];

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

  it.each(ACCEPTED_PHONES)(
    "removes every number toE164 accepts, such as %j",
    (text) => {
      const e164 = toE164(text);
      expect(e164).not.toBeNull();
      const out = redact(`phone: ${text}.`);
      expect(out.replace(/\D/g, "")).not.toContain(e164!.slice(-7));
      expect(out).toContain("[redacted]");
    },
  );

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

  it.each(ACCEPTED_PHONES)(
    "writes no number toE164 accepts to any sink, such as %j",
    (phone) => {
      const sinks = [
        vi.spyOn(console, "log").mockImplementation(() => {}),
        vi.spyOn(console, "warn").mockImplementation(() => {}),
        vi.spyOn(console, "error").mockImplementation(() => {}),
      ];

      log.info("auth.failure", { phone });
      log.warn(`auth.failure ${phone}`);
      log.error("auth.failure", { err: new Error(`bad ${phone}`) });

      const written = sinks.flatMap((s) => s.mock.calls.flat()).join("\n");
      expect(written.replace(/\D/g, "")).not.toContain(
        toE164(phone)!.slice(-7),
      );
    },
  );

  it("redacts phone numbers used as field keys at any depth", () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});

    log.info("auth.failure", {
      "+15551234567": "top",
      recipients: { "+15551234568": "invalid" },
      batches: [{ "(555) 123-4569": { "555 123 4570": 1 } }],
    });

    const line = info.mock.calls[0][0] as string;
    expect(line).not.toMatch(/123.?456\d|123.?4570/);
    expect(JSON.parse(line)).toMatchObject({
      "[redacted]": "top",
      recipients: { "[redacted]": "invalid" },
      batches: [{ "[redacted]": { "[redacted]": 1 } }],
    });
  });
});
