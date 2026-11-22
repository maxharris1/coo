import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const GUEST_HEADERS = {
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex",
};

async function headersFor(pathname: string) {
  const rules = (await nextConfig.headers?.()) ?? [];
  const sent: Record<string, string> = {};
  for (const rule of rules) {
    const match = getPathMatch(rule.source, {
      strict: true,
      removeUnnamedParams: true,
    });
    if (!match(pathname)) continue;
    for (const { key, value } of rule.headers) sent[key.toLowerCase()] = value;
  }
  return sent;
}

describe("next.config headers", () => {
  it.each([
    "/b/gerald-AAAAAAAAAAAAAAAA",
    "/api/guest/AAAAAAAAAAAAAAAA",
    "/api/guest/AAAAAAAAAAAAAAAA/notify",
  ])("keeps the guest link out of referrers and search on %s", async (path) => {
    expect(await headersFor(path)).toMatchObject(GUEST_HEADERS);
  });

  it.each(["/flights", "/api/sync"])(
    "leaves %s to the app-wide policy",
    async (path) => {
      const sent = await headersFor(path);
      expect(sent).not.toHaveProperty("referrer-policy");
      expect(sent).not.toHaveProperty("x-robots-tag");
    },
  );
});
