import { describe, expect, it } from "vitest";
import { shareMessage, smsHref } from "./shareLink";

const body = (href: string) =>
  decodeURIComponent(href.slice(href.indexOf("body=") + 5));

describe("share link text", () => {
  it.each([
    ["he", "him"],
    ["she", "her"],
    ["they", "them"],
  ] as const)("names a %s bird as %s", (pronoun, him) => {
    expect(shareMessage("https://x/b/abc", pronoun)).toBe(
      `I sent you a pigeon. For real. Watch ${him} fly to you: https://x/b/abc`,
    );
  });

  it("puts the message in the body of an sms link", () => {
    const message = shareMessage("https://x/b/abc", "he");
    const href = smsHref(message);
    expect(href.startsWith("sms:")).toBe(true);
    expect(body(href)).toBe(message);
    expect(body(href)).toContain("Watch him fly to you: https://x/b/abc");
  });
});
