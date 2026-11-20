import { describe, expect, it } from "vitest";
import { last4, toE164 } from "./phone";

describe("toE164", () => {
  it.each([
    ["(555) 123-4567", "+15551234567"],
    ["555.123.4567", "+15551234567"],
    ["1 555 123 4567", "+15551234567"],
    ["+1 (555) 123-4567", "+15551234567"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalises %s to %s", (raw, e164) => {
    expect(toE164(raw)).toBe(e164);
  });

  it.each([
    "",
    "123",
    "555-1234",
    "555 123 456a",
    "+0 555 123 4567",
    "+1234567890123456",
    "2 555 123 4567",
  ])("rejects %j", (raw) => {
    expect(toE164(raw)).toBeNull();
  });

  it("uses the default country for a national number", () => {
    expect(toE164("20 7946 0958", "44")).toBe("+442079460958");
  });
});

describe("last4", () => {
  it("returns the last four digits", () => {
    const phone = toE164("(555) 123-4567");
    expect(phone && last4(phone)).toBe("4567");
  });
});
