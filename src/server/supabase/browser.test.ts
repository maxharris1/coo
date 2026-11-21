import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { browserSupabase } from "./browser";

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("authenticates Realtime with the token from the callback", async () => {
  const client = browserSupabase(async () => "token-1");
  await client.realtime.setAuth();
  expect(client.realtime.accessTokenValue).toBe("token-1");
});
